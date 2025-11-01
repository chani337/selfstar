from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import httpx
from typing import Optional, Dict, Any, List
import os
import json
import aiomysql

from app.api.core.mysql import get_mysql_pool

from .oauth_instagram import (
    GRAPH as IG_GRAPH,
    _require_login,
    _get_persona_token,
    _get_persona_instagram_mapping,
)

router = APIRouter(prefix="/api/instagram", tags=["instagram"])


class ReplyBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    comment_id: str = Field(..., min_length=5)
    message: str = Field(..., min_length=1, max_length=500)


@router.post("/comments/reply")
async def reply_to_comment(request: Request, body: ReplyBody):
    """Reply to a specific Instagram comment using Graph API.

    Requires the persona to be OAuth-linked. Uses the persona's long-lived token.
    """
    uid = _require_login(request)
    mapping = await _get_persona_instagram_mapping(int(uid), int(body.persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(body.persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    # Graph API endpoint: POST /{comment-id}/replies with message
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{IG_GRAPH}/{body.comment_id}/replies",
                data={
                    "message": body.message,
                    "access_token": token,
                },
            )
        if r.status_code != 200:
            # Try to bubble up known auth errors
            try:
                err = (r.json() or {}).get("error") or {}
                code = err.get("code")
                if code == 190:
                    raise HTTPException(status_code=401, detail="persona_oauth_required")
            except HTTPException:
                raise
            except Exception:
                pass
            raise HTTPException(status_code=r.status_code, detail=r.text)
        data = r.json() or {}
        # ACK-hide the original comment id (best-effort)
        try:
            pool = await get_mysql_pool()
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    try:
                        await cur.execute(
                            """
                            INSERT INTO ss_instagram_event_seen (external_id, user_id, user_persona_num)
                            VALUES (%s,%s,%s)
                            ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP
                            """,
                            (str(body.comment_id), int(uid), int(body.persona_num)),
                        )
                        try:
                            await conn.commit()
                        except Exception:
                            pass
                    except Exception:
                        pass
        except Exception:
            pass
        # Typical response: {"id": "<new_comment_id>"}
        return {"ok": True, "result": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"reply_failed:{e}")


class AutoReplyBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    comment_id: str = Field(..., min_length=5)
    text: str = Field(..., min_length=1, max_length=500, description="Incoming comment text")
    post_img: Optional[str] = Field(None, description="Post image URL (optional)")
    post: Optional[str] = Field(None, description="Post caption (optional)")


class AutoDraftBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    text: str = Field(..., min_length=1, max_length=500, description="Incoming comment text")
    post_img: Optional[str] = Field(None, description="Post image URL (optional)")
    post: Optional[str] = Field(None, description="Post caption (optional)")



@router.post("/comments/auto_reply")
async def auto_reply_to_comment(request: Request, body: AutoReplyBody):
    """Generate a reply with AI, then post it to Graph and ACK-hide the comment.

    - Uses AI service /comment/reply with {post_img, post, personality, text, persona_img}
    - Posts reply to Graph: POST /{comment_id}/replies
    - ACK-hides via ss_instagram_event_seen (best-effort)
    """
    uid = _require_login(request)

    # 1) Ensure persona is linked and token available
    mapping = await _get_persona_instagram_mapping(int(uid), int(body.persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(body.persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    # 2) Load persona parameters and image to extract "personality"
    personality: str = ""
    persona_img: Optional[str] = None
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    """
                    SELECT persona_img, persona_parameters
                    FROM ss_persona
                    WHERE user_id=%s AND user_persona_num=%s
                    LIMIT 1
                    """,
                    (int(uid), int(body.persona_num)),
                )
                row = await cur.fetchone()
                if row:
                    persona_img = row.get("persona_img")
                    pp_raw = row.get("persona_parameters")
                    try:
                        pp = json.loads(pp_raw) if isinstance(pp_raw, str) else (pp_raw or {})
                    except Exception:
                        pp = {}
                    # Try common keys for tone/personality
                    for key in ("personality", "tone", "style", "voice"):
                        val = pp.get(key)
                        if isinstance(val, str) and val.strip():
                            personality = val.strip()
                            break
                    # Instagram nested section fallback
                    if not personality:
                        igp = (pp.get("instagram") or {}) if isinstance(pp, dict) else {}
                        val = igp.get("personality") or igp.get("tone")
                        if isinstance(val, str):
                            personality = val.strip()
    except Exception:
        # Non-fatal: continue with empty personality
        pass

    # 3) Call AI to generate reply text
    ai_url = (os.getenv("AI_SERVICE_URL") or "http://ai:8600").rstrip("/")
    payload = {
        "post_img": body.post_img,
        "post": body.post,
        "personality": personality or "",
        "text": body.text,
        "persona_img": persona_img,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            ar = await client.post(f"{ai_url}/comment/reply", json=payload)
        if ar.status_code != 200:
            # Bubble up AI failure clearly
            try:
                detail = ar.json()
            except Exception:
                detail = ar.text
            raise HTTPException(status_code=502, detail={"ai_failed": True, "status": ar.status_code, "body": detail})
        aj = ar.json() or {}
        reply_text = (aj.get("reply") or "").strip()
        if not reply_text:
            raise HTTPException(status_code=502, detail="ai_empty_reply")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")

    # 4) Post reply to Graph
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            gr = await client.post(
                f"{IG_GRAPH}/{body.comment_id}/replies",
                data={"message": reply_text, "access_token": token},
            )
        if gr.status_code != 200:
            try:
                err = (gr.json() or {}).get("error") or {}
                if err.get("code") == 190:
                    raise HTTPException(status_code=401, detail="persona_oauth_required")
            except HTTPException:
                raise
            except Exception:
                pass
            raise HTTPException(status_code=gr.status_code, detail=gr.text)
        grj = gr.json() or {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"graph_reply_failed:{e}")

    # 5) ACK-hide the original comment id (best-effort)
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                try:
                    await cur.execute(
                        """
                        INSERT INTO ss_instagram_event_seen (external_id, user_id, user_persona_num)
                        VALUES (%s,%s,%s)
                        ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP
                        """,
                        (str(body.comment_id), int(uid), int(body.persona_num)),
                    )
                    try:
                        await conn.commit()
                    except Exception:
                        pass
                except Exception:
                    pass
    except Exception:
        pass

    return {"ok": True, "reply": reply_text, "result": grj}


@router.post("/comments/auto_draft")
async def auto_draft_reply(request: Request, body: AutoDraftBody):
    """Generate a reply with AI only (no Graph post, no ACK). Returns reply text.

    - Uses AI service /comment/reply with {post_img, post, personality, text, persona_img}
    """
    uid = _require_login(request)

    # Ensure persona is linked for personality lookup (token not required here)
    mapping = await _get_persona_instagram_mapping(int(uid), int(body.persona_num))
    if not mapping:
        # Still allow draft without IG mapping, but warn via 400 to be explicit
        raise HTTPException(status_code=400, detail="persona_not_linked")

    # Load persona parameters and image to extract "personality"
    personality: str = ""
    persona_img: Optional[str] = None
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    """
                    SELECT persona_img, persona_parameters
                    FROM ss_persona
                    WHERE user_id=%s AND user_persona_num=%s
                    LIMIT 1
                    """,
                    (int(uid), int(body.persona_num)),
                )
                row = await cur.fetchone()
                if row:
                    persona_img = row.get("persona_img")
                    pp_raw = row.get("persona_parameters")
                    try:
                        pp = json.loads(pp_raw) if isinstance(pp_raw, str) else (pp_raw or {})
                    except Exception:
                        pp = {}
                    for key in ("personality", "tone", "style", "voice"):
                        val = pp.get(key)
                        if isinstance(val, str) and val.strip():
                            personality = val.strip()
                            break
                    if not personality:
                        igp = (pp.get("instagram") or {}) if isinstance(pp, dict) else {}
                        val = igp.get("personality") or igp.get("tone")
                        if isinstance(val, str):
                            personality = val.strip()
    except Exception:
        pass

    ai_url = (os.getenv("AI_SERVICE_URL") or "http://ai:8600").rstrip("/")
    payload = {
        "post_img": body.post_img,
        "post": body.post,
        "personality": personality or "",
        "text": body.text,
        "persona_img": persona_img,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            ar = await client.post(f"{ai_url}/comment/reply", json=payload)
        if ar.status_code != 200:
            try:
                detail = ar.json()
            except Exception:
                detail = ar.text
            raise HTTPException(status_code=502, detail={"ai_failed": True, "status": ar.status_code, "body": detail})
        aj = ar.json() or {}
        reply_text = (aj.get("reply") or "").strip()
        if not reply_text:
            raise HTTPException(status_code=502, detail="ai_empty_reply")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")

    return {"ok": True, "reply": reply_text}


class BulkReplyItem(BaseModel):
    comment_id: str = Field(..., min_length=5)
    message: str = Field(..., min_length=1, max_length=500)


class BulkReplyBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    items: List[BulkReplyItem] = Field(..., min_items=1)


@router.post("/comments/reply_bulk")
async def reply_to_comments_bulk(request: Request, body: BulkReplyBody):
    """Reply to multiple Instagram comments in a single request.

    Posts replies sequentially on the server, returns per-item result list.
    Also best-effort ACK-hides each original comment in DB.
    """
    uid = _require_login(request)
    mapping = await _get_persona_instagram_mapping(int(uid), int(body.persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(body.persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    results: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            for it in body.items:
                try:
                    r = await client.post(
                        f"{IG_GRAPH}/{it.comment_id}/replies",
                        data={"message": it.message, "access_token": token},
                    )
                    if r.status_code != 200:
                        try:
                            err = (r.json() or {}).get("error") or {}
                            if err.get("code") == 190:
                                # OAuth required/expired
                                results.append({"comment_id": it.comment_id, "ok": False, "status": 401, "error": "persona_oauth_required"})
                                continue
                        except Exception:
                            pass
                        results.append({"comment_id": it.comment_id, "ok": False, "status": r.status_code, "error": r.text})
                        continue
                    data = r.json() or {}
                    results.append({"comment_id": it.comment_id, "ok": True, "status": 200, "result": data})
                    # ACK-hide in DB (best-effort)
                    try:
                        pool = await get_mysql_pool()
                        async with pool.acquire() as conn:
                            async with conn.cursor() as cur:
                                try:
                                    await cur.execute(
                                        """
                                        INSERT INTO ss_instagram_event_seen (external_id, user_id, user_persona_num)
                                        VALUES (%s,%s,%s)
                                        ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP
                                        """,
                                        (str(it.comment_id), int(uid), int(body.persona_num)),
                                    )
                                    try:
                                        await conn.commit()
                                    except Exception:
                                        pass
                                except Exception:
                                    pass
                    except Exception:
                        pass
                except Exception as e:
                    results.append({"comment_id": it.comment_id, "ok": False, "status": 500, "error": str(e)})
        return {"ok": True, "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"reply_bulk_failed:{e}")
