from fastapi import APIRouter, HTTPException, Request, Body
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import os
from urllib.parse import urlparse, urlunparse
import httpx
import logging
import aiomysql
from app.api.core.mysql import get_mysql_pool
from app.core.s3 import s3_enabled, presign_get_url, put_data_uri, delete_object

# 파트: 채팅/이미지 생성 API
router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("chat")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    # 페르소나 번호(선택)
    persona_num: Optional[int] = Field(None, ge=1)
    messages: List[ChatMessage] = Field(default_factory=list)


@router.post("/send")
async def send(req: ChatRequest, request: Request):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages_required")
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=401, detail="not_logged_in")

    persona_img: Optional[str] = None
    if req.persona_num is not None:
        try:
            pool = await get_mysql_pool()
            async with pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cur:
                    await cur.execute(
                        """
                        SELECT persona_img
                        FROM ss_persona
                        WHERE user_id = %s AND user_persona_num = %s
                        LIMIT 1
                        """,
                        (int(user_id), int(req.persona_num)),
                    )
                    row = await cur.fetchone()
                    if row and row.get("persona_img"):
                        persona_img = row["persona_img"]
        except Exception as e:
            log.warning("persona lookup failed: %s", e)

    # persona_img가 S3 키라면 프리사인 URL로 변환
    try:
        if persona_img and not persona_img.lower().startswith("http") and not persona_img.startswith("data:") and not persona_img.startswith("/"):
            if s3_enabled():
                persona_img = presign_get_url(persona_img)
    except Exception as _e:
        log.warning("persona_img presign failed: %s", _e)

    ai_url = (os.getenv("AI_SERVICE_URL") or "http://localhost:8600").rstrip("/")
    # 전송: POST {ai}/chat
    # payload: { persona_img: str|None, messages: [{role,content}] }
    payload = {"persona_img": persona_img, "messages": [m.model_dump() for m in req.messages]}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{ai_url}/chat", json=payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")

    if r.status_code != 200:
        detail = None
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise HTTPException(status_code=502, detail={"ai_failed": True, "status": r.status_code, "body": detail})
    return r.json()


@router.get("/send")
async def send_usage():
    """간단한 사용 가이드(브라우저 GET 보호)"""
    return {
        "ok": True,
        "method": "POST only for chat",
        "usage": {
            "url": "/chat/send",
            "headers": {"Content-Type": "application/json"},
            "body": {
                "persona_num": 1,
                "messages": [{"role": "user", "content": "안녕"}],
            },
        },
        "note": "이 엔드포인트는 세션 로그인이 필요합니다. 프론트엔드에서 버튼을 눌러 호출하세요.",
    }


class ChatImageRequest(BaseModel):
    # 이미지 생성 요청 바디
    persona_num: int = Field(..., ge=1)
    user_text: str = Field(..., min_length=1)
    ls_session_id: Optional[str] = None
    # style_img: data URI 또는 URL(선택) — 의상 유지 참고 이미지
    style_img: Optional[str] = None


@router.post("/image")
async def image(req: ChatImageRequest, request: Request):
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=401, detail="not_logged_in")

    # 1) 페르소나 이미지/파라미터 조회
    persona_img: Optional[str] = None
    persona_params_json: Optional[str] = None
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    """
                    SELECT persona_img, persona_parameters
                    FROM ss_persona
                    WHERE user_id = %s AND user_persona_num = %s
                    LIMIT 1
                    """,
                    (int(user_id), int(req.persona_num)),
                )
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="persona_not_found")
                persona_db_id = int(req.persona_num)
                persona_img = row.get("persona_img")
                # persona_parameters는 JSON 문자열 또는 dict일 수 있음 → 문자열로 보냄
                pp = row.get("persona_parameters")
                if isinstance(pp, (dict, list)):
                    import json as _json
                    persona_params_json = _json.dumps(pp, ensure_ascii=False)
                else:
                    persona_params_json = pp
    except HTTPException:
        raise
    except Exception as e:
        log.exception("persona lookup failed: %s", e)
        raise HTTPException(status_code=500, detail="persona_lookup_failed")

    if not persona_img:
        raise HTTPException(status_code=400, detail="persona_img_missing")

    # 2) AI에서 접근 가능한 URL로 정규화 + S3 키면 프리사인
    def _normalize_persona_img(raw: str) -> str:
        try:
            if raw.startswith("data:"):
                return raw
            if raw.startswith("/"):
                base = (os.getenv("BACKEND_INTERNAL_URL") or "http://backend:8000").rstrip("/")
                return f"{base}{raw}"
            if raw.startswith("http://localhost") or raw.startswith("http://127.0.0.1"):
                # 호스트만 backend로 교체
                p = urlparse(raw)
                repl = p._replace(netloc="backend:8000")
                return urlunparse(repl)
            # 그 외(http/https, /media가 아닌 경우) → S3 키로 보고 프리사인 시도
            if s3_enabled():
                return presign_get_url(raw)
            return raw
        except Exception:
            return raw

    persona_img_norm = _normalize_persona_img(persona_img)
    if persona_img_norm != persona_img:
        log.info("persona_img normalized: %s -> %s", persona_img, persona_img_norm)

    ai_url = (os.getenv("AI_SERVICE_URL") or "http://localhost:8600").rstrip("/")
    # 전송: POST {ai}/chat/image
    # payload: { user_text, persona_img, persona(JSON str), ls_session_id?, style_img? }
    payload = {
        "user_text": req.user_text,
        "persona_img": persona_img_norm,
        "persona": persona_params_json or "",
        "ls_session_id": req.ls_session_id,
        "style_img": req.style_img,
    }
    log.info("/chat/image forwarding -> user_id=%s persona_num=%s", user_id, req.persona_num)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{ai_url}/chat/image", json=payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")

    if r.status_code != 200:
        # return AI body for easier debugging in frontend
        detail = None
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise HTTPException(status_code=502, detail={"ai_failed": True, "status": r.status_code, "body": detail})
    ai_json = r.json()

    # 3) 이미지 파일 저장(+ DB 기록) — S3(chat/{user_id}/{persona_id})에 저장하고 ss_chat_img에 기록
    stored = None
    try:
        img_str = ai_json.get("image") if isinstance(ai_json, dict) else None
        if isinstance(img_str, str) and img_str.startswith("data:"):
            if not s3_enabled():
                raise HTTPException(status_code=400, detail="s3_not_configured")
            # 키 경로: chat/{user_id}/{persona_id}
            key = put_data_uri(
                img_str,
                model=None,
                key_prefix=f"chat/{int(user_id)}/{int(persona_db_id)}",
                base_prefix="",
                include_model=False,
                include_date=False,
            )
            url = presign_get_url(key)

            # DB 기록: ss_chat_img(img_id PK auto, user_id, persona_id, img_key, created_at)
            chat_id = None
            try:
                pool = await get_mysql_pool()
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        inserted = False
                        # 1차 시도: 최신 컬럼(img_key)
                        try:
                            await cur.execute(
                                """
                                INSERT INTO ss_chat_img (user_id, persona_id, img_key)
                                VALUES (%s, %s, %s)
                                """,
                                (int(user_id), int(persona_db_id), key),
                            )
                            inserted = True
                        except Exception as _ie:
                            # 2차 시도: 구 스키마(persona_chat_img)
                            try:
                                await cur.execute(
                                    """
                                    INSERT INTO ss_chat_img (user_id, persona_id, persona_chat_img)
                                    VALUES (%s, %s, %s)
                                    """,
                                    (int(user_id), int(persona_db_id), key),
                                )
                                inserted = True
                            except Exception as _ie2:
                                log.warning("ss_chat_img insert failed (both schemas): %s / %s", _ie, _ie2)
                        if inserted:
                            try:
                                await conn.commit()
                            except Exception:
                                pass
                            try:
                                chat_id = cur.lastrowid
                            except Exception:
                                chat_id = None
            except Exception as _e:
                log.warning("ss_chat_img insert outer failed: %s", _e)
                chat_id = None

            stored = {"key": key, "url": url, "id": chat_id}
    except HTTPException:
        raise
    except Exception as e:
        log.warning("image store failed: %s", e)

    if isinstance(ai_json, dict):
        if stored:
            ai_json["stored"] = stored
        return ai_json
    return {"ok": True, "image": ai_json, "stored": stored}


@router.get("/gallery")
async def list_gallery(request: Request, persona_num: Optional[int] = None, limit: int = 60, offset: int = 0):
    """현재 로그인 사용자의 채팅 생성 이미지 갤러리 목록을 반환.

    - 기본 정렬: 최신순(img_id DESC)
    - persona_num이 있으면 해당 페르소나로 필터링
    - 반환 시 persona_chat_img가 S3 키면 프리사인 URL로 변환하여 url 필드에 넣어줌
    """
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=401, detail="not_logged_in")

    try:
        persona_db_id = None
        if persona_num is not None:
            # ss_chat_img.persona_id에는 user_persona_num을 저장하므로 그대로 사용
            persona_db_id = int(persona_num)

        items = []
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                rows = []
                # 1차: 최신 컬럼(img_id, img_key)
                try:
                    if persona_db_id is None:
                        await cur.execute(
                            """
                            SELECT img_id, user_id, persona_id, img_key, created_at
                            FROM ss_chat_img
                            WHERE user_id=%s
                            ORDER BY img_id DESC
                            LIMIT %s OFFSET %s
                            """,
                            (int(user_id), int(limit), int(offset)),
                        )
                    else:
                        await cur.execute(
                            """
                            SELECT img_id, user_id, persona_id, img_key, created_at
                            FROM ss_chat_img
                            WHERE user_id=%s AND persona_id=%s
                            ORDER BY img_id DESC
                            LIMIT %s OFFSET %s
                            """,
                            (int(user_id), int(persona_db_id), int(limit), int(offset)),
                        )
                    rows = await cur.fetchall() or []
                except Exception as _se:
                    # 2차: 구 스키마(chat_img_id, persona_chat_img)
                    try:
                        if persona_db_id is None:
                            await cur.execute(
                                """
                                SELECT chat_img_id AS img_id, user_id, persona_id, persona_chat_img AS img_key, created_at
                                FROM ss_chat_img
                                WHERE user_id=%s
                                ORDER BY chat_img_id DESC
                                LIMIT %s OFFSET %s
                                """,
                                (int(user_id), int(limit), int(offset)),
                            )
                        else:
                            await cur.execute(
                                """
                                SELECT chat_img_id AS img_id, user_id, persona_id, persona_chat_img AS img_key, created_at
                                FROM ss_chat_img
                                WHERE user_id=%s AND persona_id=%s
                                ORDER BY chat_img_id DESC
                                LIMIT %s OFFSET %s
                                """,
                                (int(user_id), int(persona_db_id), int(limit), int(offset)),
                            )
                        rows = await cur.fetchall() or []
                    except Exception as _se2:
                        # 운영 DB 권한/스키마 문제로 테이블이 없거나 조회 실패 시 빈 목록 반환
                        log.warning("gallery select failed on both schemas; returning empty. err1=%s err2=%s", _se, _se2)
                        rows = []
        for r in rows:
            key = r.get("img_key") or ""
            url = key
            if key and not key.lower().startswith("http") and not key.startswith("/"):
                try:
                    if s3_enabled():
                        url = presign_get_url(key)
                except Exception:
                    url = key
            # created_at이 문자열로 반환되는 운영 DB 대비
            ca = r.get("created_at")
            if ca:
                try:
                    created_at = ca.isoformat() if hasattr(ca, "isoformat") else str(ca)
                except Exception:
                    created_at = None
            else:
                created_at = None
            items.append({
                "id": r.get("img_id"),
                "persona_id": r.get("persona_id"),
                "key": key,
                "url": url,
                "created_at": created_at,
            })
        return {"ok": True, "items": items}
    except Exception as e:
        # 프로덕션 안전: 갤러리 조회에 실패해도 빈 목록 반환하여 UI가 붕괴되지 않도록 함
        log.warning("failed to list gallery; returning empty list: %s", e)
        return {"ok": True, "items": []}


@router.delete("/gallery/{img_id}")
async def delete_gallery_item(request: Request, img_id: int):
    """Delete a gallery image by id for the current user.

    - Removes DB row (best-effort for both new/legacy schemas)
    - Deletes S3 object by key if configured
    """
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=401, detail="not_logged_in")

    key: Optional[str] = None
    # Look up the row to get key and ensure ownership
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                try:
                    await cur.execute(
                        """
                        SELECT img_key AS k
                        FROM ss_chat_img
                        WHERE img_id=%s AND user_id=%s
                        LIMIT 1
                        """,
                        (int(img_id), int(user_id)),
                    )
                except Exception:
                    await cur.execute(
                        """
                        SELECT persona_chat_img AS k
                        FROM ss_chat_img
                        WHERE chat_img_id=%s AND user_id=%s
                        LIMIT 1
                        """,
                        (int(img_id), int(user_id)),
                    )
                row = await cur.fetchone()
                key = (row or {}).get("k") if row else None
            async with conn.cursor() as cur2:
                # Try new schema id first
                try:
                    await cur2.execute("DELETE FROM ss_chat_img WHERE img_id=%s AND user_id=%s", (int(img_id), int(user_id)))
                except Exception:
                    # Fallback legacy id
                    try:
                        await cur2.execute("DELETE FROM ss_chat_img WHERE chat_img_id=%s AND user_id=%s", (int(img_id), int(user_id)))
                    except Exception:
                        pass
                try:
                    await conn.commit()
                except Exception:
                    pass
    except Exception as e:
        log.warning("delete_gallery lookup/delete failed: %s", e)

    # Attempt to delete S3 object if key looks like one
    try:
        if key and not key.lower().startswith("http") and not key.startswith("/"):
            delete_object(key)
    except Exception:
        pass
    return {"ok": True}


@router.get("/image")
async def image_usage():
    """간단한 사용 가이드(브라우저 GET 보호) — 실제 엔드포인트는 POST /chat/image"""
    return {
        "ok": True,
        "method": "POST only for image generation",
        "usage": {
            "url": "/chat/image",
            "headers": {"Content-Type": "application/json"},
            "body": {"persona_num": 1, "user_text": "패션쇼 무드의 블랙 드레스", "ls_session_id": "<optional>", "style_img": "<optional data-uri or url>"},
        },
        "note": "세션 로그인이 필요합니다. 프론트엔드에서 '이미지 생성' 버튼을 눌러 호출하세요.",
    }


@router.post("/session/start")
async def start_chat_session(request: Request):
    """파트: 세션 시작 — LangSmith 세션 ID 발급"""
    import uuid, time
    sid = str(uuid.uuid4())
    try:
        if hasattr(request, "session"):
            request.session["ls_session_id"] = sid
    except Exception:
        pass
    # LangSmith 가시화 하트비트(선택)
    try:
        ai_url = (os.getenv("AI_SERVICE_URL") or "http://ai:8600").rstrip("/")
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{ai_url}/chat/trace/heartbeat", json={"ls_session_id": sid})
    except Exception:
        # Non-fatal: just ignore if AI is not reachable
        pass
    return {"ok": True, "ls_session_id": sid, "started_at": int(time.time())}


@router.post("/session/end")
async def end_chat_session(request: Request, body: dict = Body(default={})): 
    """파트: 세션 종료"""
    sid = None
    try:
        sid = body.get("ls_session_id") if isinstance(body, dict) else None
        if not sid and hasattr(request, "session"):
            sid = request.session.pop("ls_session_id", None)
    except Exception:
        pass
    # Best-effort: notify AI to clear any in-memory session state
    try:
        if sid:
            ai_url = (os.getenv("AI_SERVICE_URL") or "http://ai:8600").rstrip("/")
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(f"{ai_url}/chat/session/clear", json={"ls_session_id": sid})
    except Exception:
        pass
    return {"ok": True, "ls_session_id": sid}
