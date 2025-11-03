from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import httpx
from typing import Optional, Dict, Any, List
import os
import json
import aiomysql

from app.api.core.mysql import get_mysql_pool
from app.core.s3 import s3_enabled, presign_get_url, put_data_uri

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


class PostCommentBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    message: str = Field(..., min_length=1, max_length=1000)


@router.post("/media/{media_id}/comment")
async def post_comment_on_media(request: Request, media_id: str, body: PostCommentBody):
    """Leave a new comment on a media as the linked persona account.

    Graph API: POST /{ig-media-id}/comments with { message }
    """
    uid = _require_login(request)
    mapping = await _get_persona_instagram_mapping(int(uid), int(body.persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(body.persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{IG_GRAPH}/{media_id}/comments",
                data={"message": body.message, "access_token": token},
            )
        if r.status_code != 200:
            try:
                err = (r.json() or {}).get("error") or {}
                if err.get("code") == 190:
                    raise HTTPException(status_code=401, detail="persona_oauth_required")
            except HTTPException:
                raise
            except Exception:
                pass
            raise HTTPException(status_code=r.status_code, detail=r.text)
        data = r.json() or {}
        return {"ok": True, "result": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"post_comment_failed:{e}")


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


# ===== 자동 이미지 생성: 댓글 기반 생성 → S3 저장 → 갤러리 반영 =====

class AutoImageBody(BaseModel):
    persona_num: int = Field(..., ge=0)
    comment_id: str = Field(..., min_length=5)
    text: str = Field(..., min_length=1, max_length=1000)
    post_img: Optional[str] = Field(None, description="Post image URL (optional)")
    post: Optional[str] = Field(None, description="Post caption (optional)")


_IMAGE_KEYWORDS = [
    "사진", "이미지", "그림", "그려줘", "만들어줘",
    "image", "picture", "photo", "render", "generate",
]


def _looks_like_image_request(text: str) -> bool:
    try:
        low = (text or "").lower()
        for k in _IMAGE_KEYWORDS:
            if k.lower() in low:
                return True
        for s in ("만들어줘", "그려줘", "렌더링"):
            if s in text:
                return True
    except Exception:
        pass
    return False


def _normalize_persona_img(raw: str) -> str:
    try:
        if raw.startswith("data:"):
            return raw
        if raw.startswith("/"):
            base = (os.getenv("BACKEND_INTERNAL_URL") or "http://backend:8000").rstrip("/")
            return f"{base}{raw}"
        if raw.startswith("http://localhost") or raw.startswith("http://127.0.0.1"):
            from urllib.parse import urlparse, urlunparse
            p = urlparse(raw)
            repl = p._replace(netloc="backend:8000")
            return urlunparse(repl)
        if s3_enabled() and not raw.lower().startswith("http"):
            return presign_get_url(raw)
        return raw
    except Exception:
        return raw


@router.post("/comments/auto_image")
async def auto_image_for_comment(request: Request, body: AutoImageBody):
    """댓글 텍스트를 보고 이미지 요청이면 자동으로 생성하여 갤러리에 저장합니다.

    - 판별: 간단 키워드 기반 (운영 시 Gemini 등으로 고도화 권장)
    - 생성: AI 서비스 /chat/image 위임 (data URI 수신)
    - 저장: S3 업로드 + ss_chat_img 기록
    - 중복 방지: 옵션에 따라 ss_instagram_event_seen에 ACK 기록
    """
    uid = _require_login(request)

    enabled = (os.getenv("AUTO_IMAGE_COMMENTS", "1").strip().lower() in ("1", "true", "yes"))
    if not enabled:
        return {"ok": False, "skipped": True, "reason": "disabled"}

    if not _looks_like_image_request(body.text):
        return {"ok": False, "skipped": True, "reason": "not_image_request"}

    persona_img: Optional[str] = None
    persona_params_json: Optional[str] = None
    persona_db_id = int(body.persona_num)
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
                    (int(uid), int(persona_db_id)),
                )
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="persona_not_found")
                persona_img = row.get("persona_img")
                pp = row.get("persona_parameters")
                if isinstance(pp, (dict, list)):
                    persona_params_json = json.dumps(pp, ensure_ascii=False)
                else:
                    persona_params_json = pp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"persona_lookup_failed:{e}")

    if not persona_img:
        raise HTTPException(status_code=400, detail="persona_img_missing")

    persona_img_norm = _normalize_persona_img(str(persona_img))

    ai_url = (os.getenv("AI_SERVICE_URL") or "http://localhost:8600").rstrip("/")
    payload = {
        "user_text": body.text,
        "persona_img": persona_img_norm,
        "persona": persona_params_json or "",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{ai_url}/chat/image", json=payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")
    if r.status_code != 200:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise HTTPException(status_code=502, detail={"ai_failed": True, "status": r.status_code, "body": detail})
    ai_json = r.json() or {}
    img_data_uri = ai_json.get("image")
    if not (isinstance(img_data_uri, str) and img_data_uri.startswith("data:")):
        raise HTTPException(status_code=502, detail="invalid_ai_response")

    if not s3_enabled():
        raise HTTPException(status_code=400, detail="s3_not_configured")
    key = put_data_uri(
        img_data_uri,
        model=None,
        key_prefix=f"chat/{int(uid)}/{int(persona_db_id)}",
        base_prefix="",
        include_model=False,
        include_date=False,
    )
    url = presign_get_url(key)

    chat_id = None
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                inserted = False
                try:
                    await cur.execute(
                        """
                        INSERT INTO ss_chat_img (user_id, persona_id, img_key)
                        VALUES (%s, %s, %s)
                        """,
                        (int(uid), int(persona_db_id), key),
                    )
                    inserted = True
                except Exception:
                    try:
                        await cur.execute(
                            """
                            INSERT INTO ss_chat_img (user_id, persona_id, persona_chat_img)
                            VALUES (%s, %s, %s)
                            """,
                            (int(uid), int(persona_db_id), key),
                        )
                        inserted = True
                    except Exception:
                        inserted = False
                if inserted:
                    try:
                        await conn.commit()
                    except Exception:
                        pass
                    try:
                        chat_id = cur.lastrowid
                    except Exception:
                        chat_id = None
    except Exception:
        pass

    try:
        if (os.getenv("AUTO_IMAGE_ACK_SEEN", "1").strip().lower() in ("1", "true", "yes")):
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
                            (str(body.comment_id), int(uid), int(persona_db_id)),
                        )
                        try:
                            await conn.commit()
                        except Exception:
                            pass
                    except Exception:
                        pass
    except Exception:
        pass

    return {
        "ok": True,
        "stored": {"key": key, "url": url, "id": chat_id},
        "prompt": ai_json.get("prompt"),
    }


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
