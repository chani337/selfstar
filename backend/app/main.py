"""
[파트 개요] Backend 메인 엔트리포인트
- 프론트 통신: CORS/세션 설정으로 프론트(기본 5174)와 안전한 쿠키/요청 교환
- AI 통신: 이미지 생성 등은 images 라우터에서 AI 서버(기본 8600)로 위임
- 외부 통신: OAuth 등 외부 프로바이더는 auth 라우터에서 처리
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
import logging
from dotenv import load_dotenv, dotenv_values, find_dotenv
import os
from datetime import datetime, timezone
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.health import HealthResponse
from urllib.parse import urlparse
import asyncio
import httpx
import aiomysql

# .env 파일 로드 순서 (컨테이너/로컬 모두에서 동작)
# - 앱 디렉터리: /app/app
# - 리포지토리 루트(컨테이너 기준): /app
_APP_DIR = os.path.dirname(__file__)
_REPO_ROOT = os.path.abspath(os.path.join(_APP_DIR, ".."))  # /app/app -> /app
_ROOT_ENV = os.path.join(_REPO_ROOT, ".env")  # /app/.env

# 1) 리포지토리 루트 .env (최우선)
load_dotenv(dotenv_path=_ROOT_ENV, override=True)
# 2) app/.env (보조 또는 덮어쓰기)
load_dotenv(dotenv_path=os.path.join(_APP_DIR, ".env"), override=True)

# 로깅 초기화
logger = get_logger("env_loader")

# (디버그) 프로젝트 루트의 .env 파일 경로와 내용을 로그로 출력
logger.info("리포지토리 루트 .env 파일을 불러오는 중…")
if not os.path.exists(_ROOT_ENV):
    logger.warning(f"루트 .env 파일({_ROOT_ENV})을 찾지 못했습니다. compose/env_file 또는 환경변수를 사용 중일 수 있습니다.")

# 주요 환경변수 로깅
logger.info(f"KAKAO_CLIENT_ID set: {'yes' if os.getenv('KAKAO_CLIENT_ID') else 'no'}")
logger.info(f"BACKEND_URL: {os.getenv('BACKEND_URL')}")
logger.info(f"FRONTEND_URL: {os.getenv('FRONTEND_URL')}")
logger.info(f"SESSION_SECRET set: {'yes' if os.getenv('SESSION_SECRET') else 'no'}")

# (디버그) 루트/app의 .env 키/값 전체 로드 및 로그
try:
    env_values_root = dotenv_values(_ROOT_ENV)
    logger.info(f"루트 .env 키 수: {len(env_values_root or {})}")
except Exception:
    pass
try:
    env_values_app = dotenv_values(os.path.join(_APP_DIR, ".env"))
    logger.info(f"app/.env 키 수: {len(env_values_app or {})}")
except Exception:
    pass

app = FastAPI(debug=True)

# ===== CORS =====
# 브라우저 쿠키(credential)를 사용하므로 절대 와일드카드(*)를 쓰지 않습니다.
# FRONTEND_URL 을 기반으로 localhost/127.0.0.1 변형과 5173/5174 포트까지 화이트리스트에 추가합니다.
FRONTEND_URL = settings.FRONTEND_URL

def _origin_variants(url: str) -> list[str]:
    try:
        p = urlparse(url)
        if not p.scheme or not p.netloc:
            return []
        host = p.hostname or "localhost"
        port = p.port or (5174 if host in {"localhost", "127.0.0.1"} else None)
        scheme = p.scheme
        candidates = set()
        def add(h: str, prt: int|None):
            if prt:
                base = f"{scheme}://{h}:{prt}"
            else:
                base = f"{scheme}://{h}"
            candidates.add(base)
            candidates.add(base.rstrip('/'))
        # 입력 URL 그대로
        add(host, port)
        # localhost/127.0.0.1 상호 변환
        if host == "localhost":
            add("127.0.0.1", port)
        if host == "127.0.0.1":
            add("localhost", port)
        # Vite 기본 포트 변형
        for alt_port in (5173, 5174):
            if port != alt_port:
                add(host, alt_port)
                add("127.0.0.1", alt_port)
                add("localhost", alt_port)
        return sorted(candidates)
    except Exception:
        return []

allow_origins = sorted(set([FRONTEND_URL, FRONTEND_URL.rstrip("/")] + _origin_variants(FRONTEND_URL)))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Session (쿠키 기반) =====
SESSION_SECRET = settings.SESSION_SECRET
# 세션을 1일(86400초) 동안 유지
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, max_age=86400)

# (디버그) 세션 시크릿과 MySQL 풀 초기화 로그
logger.info(f"SESSION_SECRET: {SESSION_SECRET}")
logger.info("Initializing MySQL pool...")

# ===== Routers =====
# api 라우터 집계(import 에러 무시)
try:
    from app.api.routes import router as api_router
    app.include_router(api_router)
    logger.info("api_router registered from app.api.routes")
except Exception as e:
    logger.warning(f"No api_router found in app.api.routes: {e}")

# 라우트 모듈 자체에서 /api 접두사를 포함하도록 변경했으므로, 개별 prefix 포함은 제거합니다.

# ===== Static mounts =====
# media (기존 자산)
_DEFAULT_MEDIA = os.path.join(os.path.dirname(__file__), "media")
MEDIA_ROOT = os.getenv("MEDIA_ROOT") or _DEFAULT_MEDIA
try:
    os.makedirs(MEDIA_ROOT, exist_ok=True)
except Exception as _e:
    logger.error(f"Failed to create media directory {MEDIA_ROOT}: {_e}")

try:
    app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")
    logger.info(f"Mounted static media at /media -> {MEDIA_ROOT}")
except Exception as _e:
    logger.error(f"Failed to mount /media: {_e}")

# (제거) files 정적 마운트는 더 이상 사용하지 않음(S3로 대체)

# ===== Health =====
@app.get("/")
def root():
    return {"message": "Welcome to the API!"}

# (디버그) 등록된 경로를 보려면 /__routes 로 확인 가능
@app.get("/__routes")
def routes_debug():
    # Route 객체 자체는 JSON 직렬화가 어려우므로 경로 문자열만 반환
    return sorted([getattr(r, "path", "") for r in app.router.routes])

# ===== App lifecycle =====
@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse.ok()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

# ===== Background: Daily insights snapshot =====
async def _daily_snapshot_loop():
    """Run once a day: iterate linked personas and perform snapshot."""
    # Lazy imports to avoid circular
    from app.api.core.mysql import get_mysql_pool
    from app.api.routes.instagram_insights import perform_snapshot
    import aiomysql
    while True:
        try:
            pool = await get_mysql_pool()
            personas = []
            async with pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cur:
                    # ss_persona에 IG가 연결되어 있고, persona 토큰도 존재하는 페르소나만
                    await cur.execute(
                        """
                        SELECT p.user_id, p.user_persona_num
                        FROM ss_persona p
                        JOIN ss_instagram_connector_persona t
                          ON t.user_id = p.user_id AND t.user_persona_num = p.user_persona_num
                        WHERE p.ig_user_id IS NOT NULL
                        LIMIT 500
                        """
                    )
                    personas = await cur.fetchall() or []
            for row in personas:
                try:
                    await perform_snapshot(int(row["user_id"]), int(row["user_persona_num"]))
                except Exception:
                    # non-fatal; continue others
                    pass
        except Exception:
            pass
        # sleep until next run (~24h). Start quickly next day; if server restarts midday, still runs 24h cadence.
        await asyncio.sleep(60 * 60 * 24)


# ===== Background: Auto-reply scheduler (interval configurable) =====
async def _auto_reply_scheduler_loop():
    """Every few minutes, for Business users' linked personas:
    - Fetch recent media and comments
    - Filter out already ACK-ed comments
    - Generate AI replies and post to Graph
    - ACK each processed comment

    Env toggles:
    - AUTO_REPLY_SCHEDULER_ENABLED (1/0; default 1)
    - AUTO_REPLY_INTERVAL_SECONDS (default 300)
    - AUTO_REPLY_MEDIA_LIMIT (default 3)
    - AUTO_REPLY_COMMENTS_LIMIT (default 5)
    - AUTO_REPLY_MAX_PER_PERSONA (default 5 per cycle)
    """
    # Lazy imports to avoid circulars
    from app.api.core.mysql import get_mysql_pool
    from app.api.routes.oauth_instagram import GRAPH as IG_GRAPH, _get_persona_token
    from app.api.routes.instagram_comments import _fetch_recent_media_and_comments

    ai_url = (os.getenv("AI_SERVICE_URL") or "http://ai:8600").rstrip("/")
    enabled = (os.getenv("AUTO_REPLY_SCHEDULER_ENABLED", "1").strip().lower() in ("1", "true", "yes"))
    interval = int(os.getenv("AUTO_REPLY_INTERVAL_SECONDS", "300") or 300)
    media_limit = int(os.getenv("AUTO_REPLY_MEDIA_LIMIT", "3") or 3)
    comments_limit = int(os.getenv("AUTO_REPLY_COMMENTS_LIMIT", "5") or 5)
    max_per_persona = int(os.getenv("AUTO_REPLY_MAX_PER_PERSONA", "5") or 5)

    sched_log = get_logger("auto_reply_scheduler")
    if not enabled:
        sched_log.info("Auto-reply scheduler disabled by env. Not starting loop.")
        return

    async def _maybe_generate_image_for_comment(client: httpx.AsyncClient, ai_url: str, text: str, persona_img_norm: str | None, uid: int, persona_num: int, persona_params_json: str | None):
        """Best-effort image generation and storage for image-like requests.
        Swallows all exceptions to avoid impacting reply flow.
        """
        try:
            auto_img_enabled = (os.getenv("AUTO_IMAGE_COMMENTS", "1").strip().lower() in ("1", "true", "yes"))
            if not auto_img_enabled:
                return
            if not persona_img_norm:
                return
            if not _looks_like_image_request(text or ""):
                return
            ai_payload = {
                "user_text": text,
                "persona_img": persona_img_norm,
                "persona": persona_params_json or "",
            }
            r = await client.post(f"{ai_url}/chat/image", json=ai_payload)
            if r.status_code != 200:
                return
            aj = r.json() or {}
            img_data_uri = aj.get("image")
            if not (isinstance(img_data_uri, str) and img_data_uri.startswith("data:")):
                return
            try:
                from app.core.s3 import s3_enabled, put_data_uri
                if not s3_enabled():
                    return
                key = put_data_uri(
                    img_data_uri,
                    model=None,
                    key_prefix=f"drafts/{uid}/{persona_num}",
                    base_prefix="",
                    include_model=False,
                    include_date=False,
                )
                # Store record (best-effort)
                try:
                    pool2 = await get_mysql_pool()
                    async with pool2.acquire() as conn2:
                        async with conn2.cursor() as cur2:
                            try:
                                await cur2.execute(
                                    """
                                    INSERT INTO ss_chat_img (user_id, persona_id, img_key)
                                    VALUES (%s, %s, %s)
                                    """,
                                    (int(uid), int(persona_num), key),
                                )
                            except Exception:
                                try:
                                    await cur2.execute(
                                        """
                                        INSERT INTO ss_chat_img (user_id, persona_id, persona_chat_img)
                                        VALUES (%s, %s, %s)
                                        """,
                                        (int(uid), int(persona_num), key),
                                    )
                                except Exception:
                                    pass
                            try:
                                await conn2.commit()
                            except Exception:
                                pass
                except Exception:
                    pass
            except Exception:
                pass
        except Exception:
            pass

    def _extract_mbti_from_params(pp_raw: str | dict | None) -> str:
        try:
            import json as _json
            if isinstance(pp_raw, str):
                try:
                    pp = _json.loads(pp_raw)
                except Exception:
                    pp = {}
            else:
                pp = pp_raw or {}
            if not isinstance(pp, dict):
                return ""
            for key in ("mbti", "MBTI", "mbti_type", "personality_mbti"):
                val = pp.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
            import re as _re
            for key in ("personality", "tone", "style", "voice"):
                val = pp.get(key)
                if isinstance(val, str) and val.strip():
                    s = val.strip().upper()
                    if _re.match(r"^[E|I][N|S][F|T][P|J]$", s):
                        return s
            igp = (pp.get("instagram") or {}) if isinstance(pp, dict) else {}
            val = igp.get("personality") or igp.get("tone")
            if isinstance(val, str) and val.strip():
                return val.strip()
        except Exception:
            pass
        return ""

    async def _auto_image_publish_for_comment(
        client: httpx.AsyncClient,
        ai_url: str,
        uid: int,
        persona_num: int,
        ig_user_id: str,
        access_token: str,
        comment_id: str,
        comment_text: str,
        persona_img_norm: str | None,
        persona_params_json: str | None,
        sched_log: logging.Logger,
    ) -> bool:
        """Generate an image and auto-publish to Instagram for Business personas.
        Returns True on successful publish (and ACK), False otherwise.
        """
        try:
            # Require S3 for public URL
            from app.core.s3 import s3_enabled, put_data_uri, presign_get_url
            if not s3_enabled() or not persona_img_norm:
                return False
            # 1) Generate image via AI
            payload = {
                "user_text": comment_text,
                "persona_img": persona_img_norm,
                "persona": persona_params_json or "",
            }
            r = await client.post(f"{ai_url}/chat/image", json=payload)
            if r.status_code != 200:
                return False
            aj = r.json() or {}
            img_data_uri = aj.get("image")
            if not (isinstance(img_data_uri, str) and img_data_uri.startswith("data:")):
                return False
            # 2) Upload to S3
            key = put_data_uri(
                img_data_uri,
                model=None,
                key_prefix=f"drafts/{int(uid)}/{int(persona_num)}",
                base_prefix="",
                include_model=False,
                include_date=False,
            )
            url = presign_get_url(key)

            # Store record (best-effort)
            try:
                pool2 = await get_mysql_pool()
                async with pool2.acquire() as conn2:
                    async with conn2.cursor() as cur2:
                        try:
                            await cur2.execute(
                                """
                                INSERT INTO ss_chat_img (user_id, persona_id, img_key)
                                VALUES (%s, %s, %s)
                                """,
                                (int(uid), int(persona_num), key),
                            )
                        except Exception:
                            try:
                                await cur2.execute(
                                    """
                                    INSERT INTO ss_chat_img (user_id, persona_id, persona_chat_img)
                                    VALUES (%s, %s, %s)
                                    """,
                                    (int(uid), int(persona_num), key),
                                )
                            except Exception:
                                pass
                        try:
                            await conn2.commit()
                        except Exception:
                            pass
            except Exception:
                pass

            # 3) Generate caption (optional)
            personality_hint = _extract_mbti_from_params(persona_params_json)
            auto_caption: str | None = None
            try:
                cr = await client.post(f"{ai_url}/caption/generate", json={"image": url, "personality": personality_hint or "", "tone": None})
                if cr.status_code == 200:
                    cj = cr.json() or {}
                    cap = (cj.get("caption") or "").strip()
                    auto_caption = cap or None
            except Exception:
                pass

            # Fallback caption to avoid empty posts when AI captioning is unavailable in prod
            if not auto_caption:
                try:
                    def _simple_fallback_caption(src_text: str, personality: str | None) -> str:
                        t = (src_text or "").strip()
                        # If the original comment looks like an image-generation request,
                        # avoid echoing it as caption and use a safe, short default.
                        kws = [
                            "사진", "이미지", "그림", "그려줘", "만들어줘",
                            "image", "picture", "photo", "render", "generate",
                        ]
                        use_comment = True
                        low = t.lower()
                        for k in kws:
                            if k.lower() in low:
                                use_comment = False
                                break
                        if use_comment and t:
                            if len(t) > 80:
                                t = t[:80].rstrip() + "…"
                            return t
                        return "오늘의 순간을 기록해요."

                    auto_caption = _simple_fallback_caption(comment_text, personality_hint)
                    try:
                        sched_log.info("auto-image-publish: caption fallback used")
                    except Exception:
                        pass
                except Exception:
                    auto_caption = "오늘의 순간을 기록해요."

            # 4) Publish to Instagram
            create = await client.post(
                f"{IG_GRAPH}/{ig_user_id}/media",
                data={
                    "image_url": url,
                    "caption": auto_caption or "",
                    "access_token": access_token,
                },
            )
            if create.status_code != 200:
                return False
            creation_id = (create.json() or {}).get("id")
            if not creation_id:
                return False

            # Wait for readiness
            try:
                poll_interval = float(os.getenv("IG_POLL_INTERVAL_SECONDS", "1.0") or 1.0)
                poll_attempts = int(os.getenv("IG_POLL_MAX_ATTEMPTS", "20") or 20)
                for _ in range(poll_attempts):
                    gr = await client.get(
                        f"{IG_GRAPH}/{creation_id}",
                        params={"access_token": access_token, "fields": "status_code"},
                    )
                    if gr.status_code == 200:
                        st = (gr.json() or {}).get("status_code")
                        if st == "FINISHED":
                            break
                        if st == "ERROR":
                            break
                    await asyncio.sleep(poll_interval)
            except Exception:
                pass

            async def _do_publish():
                return await client.post(
                    f"{IG_GRAPH}/{ig_user_id}/media_publish",
                    data={"creation_id": creation_id, "access_token": access_token},
                )

            pub = await _do_publish()
            if pub.status_code != 200:
                try:
                    j = pub.json() or {}
                    err = (j.get("error") or {})
                    if err.get("code") == 9007 or err.get("error_subcode") == 2207027:
                        retry_sleep = float(os.getenv("IG_PUBLISH_RETRY_SLEEP", "2.0") or 2.0)
                        await asyncio.sleep(retry_sleep)
                        pub2 = await _do_publish()
                        if pub2.status_code != 200:
                            return False
                except Exception:
                    return False

            # 5) ACK original comment id
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
                                (str(comment_id), int(uid), int(persona_num)),
                            )
                            try:
                                await conn.commit()
                            except Exception:
                                pass
                        except Exception:
                            pass
            except Exception:
                pass

            try:
                sched_log.info(f"auto-image-publish: ok uid={uid} num={persona_num}")
            except Exception:
                pass
            return True
        except Exception:
            return False

    while True:
        try:
            pool = await get_mysql_pool()
            personas: list[dict] = []
            # Discover business users' IG-linked personas which have persona-level tokens
            async with pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cur:
                    try:
                        await cur.execute(
                            """
                            SELECT p.user_id, p.user_persona_num AS persona_num,
                                   p.ig_user_id, p.persona_img, p.persona_parameters
                            FROM ss_persona p
                            JOIN ss_user u ON u.user_id = p.user_id
                            JOIN ss_instagram_connector_persona t
                              ON t.user_id = p.user_id AND t.user_persona_num = p.user_persona_num
                            WHERE p.ig_user_id IS NOT NULL
                              AND LOWER(u.user_credit) IN ('business', 'biz')
                            LIMIT 200
                            """
                        )
                        personas = await cur.fetchall() or []
                    except Exception as e:
                        sched_log.warning(f"persona discovery failed: {e}")
                        personas = []

            if not personas:
                await asyncio.sleep(interval)
                continue

            async with httpx.AsyncClient(timeout=30) as client:
                for p in personas:
                    try:
                        uid = int(p.get("user_id"))
                        persona_num = int(p.get("persona_num"))
                        token = await _get_persona_token(uid, persona_num)
                        ig_user_id = p.get("ig_user_id")
                        if not (token and ig_user_id):
                            continue

                        # Fetch recent media & comments
                        media_items, _dbg = await _fetch_recent_media_and_comments(
                            client,
                            str(ig_user_id),
                            str(token),
                            media_limit=media_limit,
                            comments_limit=comments_limit,
                            return_debug=False,
                        )
                        try:
                            sched_log.info(f"auto-reply: persona uid={uid} num={persona_num} media={len(media_items)}")
                        except Exception:
                            pass

                        # Gather unseen top-level comment ids and needed context
                        comment_tasks: list[dict] = []
                        all_comment_ids: list[str] = []
                        for m in media_items:
                            for c in (m.get("comments") or []):
                                cid = c.get("id")
                                text = c.get("text")
                                if isinstance(cid, str) and text and text.strip():
                                    all_comment_ids.append(cid)
                        if not all_comment_ids:
                            try:
                                sched_log.info(f"auto-reply: no comments found uid={uid} num={persona_num}")
                            except Exception:
                                pass
                            continue

                        # Filter seen comments
                        seen_ids: set[str] = set()
                        async with (await get_mysql_pool()).acquire() as conn:
                            async with conn.cursor(aiomysql.DictCursor) as cur:
                                try:
                                    chunks = [all_comment_ids[i:i+100] for i in range(0, len(all_comment_ids), 100)]
                                    for ch in chunks:
                                        ph = ",".join(["%s"] * len(ch))
                                        await cur.execute(
                                            f"""
                                            SELECT external_id FROM ss_instagram_event_seen
                                            WHERE external_id IN ({ph})
                                            """,
                                            ch,
                                        )
                                        for r in (await cur.fetchall()) or []:
                                            sid = r.get("external_id")
                                            if isinstance(sid, str):
                                                seen_ids.add(sid)
                                except Exception:
                                    seen_ids = set()

                        # Build tasks capped per persona
                        for m in media_items:
                            post_img = m.get("media_url") or m.get("thumbnail_url")
                            caption = m.get("caption")
                            for c in (m.get("comments") or []):
                                cid = c.get("id")
                                if not cid or cid in seen_ids:
                                    continue
                                text = (c.get("text") or "").strip()
                                if not text:
                                    continue
                                comment_tasks.append({
                                    "comment_id": cid,
                                    "text": text,
                                    "post_img": post_img,
                                    "post": caption,
                                })
                                if len(comment_tasks) >= max_per_persona:
                                    break
                            if len(comment_tasks) >= max_per_persona:
                                break

                        if not comment_tasks:
                            try:
                                sched_log.info(f"auto-reply: no unseen comments uid={uid} num={persona_num}")
                            except Exception:
                                pass
                            continue

                        # Extract persona personality and image
                        personality = ""
                        persona_img = p.get("persona_img")
                        persona_params_json: str | None = None
                        try:
                            raw = p.get("persona_parameters")
                            import json as _json
                            pp = _json.loads(raw) if isinstance(raw, str) else (raw or {})
                            try:
                                if isinstance(raw, (dict, list)):
                                    import json as _json2
                                    persona_params_json = _json2.dumps(raw, ensure_ascii=False)
                                elif isinstance(raw, str):
                                    persona_params_json = raw
                            except Exception:
                                persona_params_json = None
                            if isinstance(pp, dict):
                                for key in ("personality", "tone", "style", "voice"):
                                    val = pp.get(key)
                                    if isinstance(val, str) and val.strip():
                                        personality = val.strip()
                                        break
                                if not personality:
                                    igp = pp.get("instagram") or {}
                                    if isinstance(igp, dict):
                                        val = igp.get("personality") or igp.get("tone")
                                        if isinstance(val, str) and val.strip():
                                            personality = val.strip()
                        except Exception:
                            pass

                        # Normalize persona_img for AI if needed
                        def _norm_img(raw_url: str | None) -> str | None:
                            if not raw_url:
                                return None
                            s = str(raw_url)
                            try:
                                from app.core.s3 import s3_enabled, presign_get_url
                                if s.startswith("data:"):
                                    return s
                                if s.startswith("/"):
                                    base = (os.getenv("BACKEND_INTERNAL_URL") or "http://backend:8000").rstrip("/")
                                    return f"{base}{s}"
                                if s.lower().startswith("http://localhost") or s.lower().startswith("http://127.0.0.1"):
                                    from urllib.parse import urlparse, urlunparse
                                    purl = urlparse(s)
                                    return urlunparse(purl._replace(netloc="backend:8000"))
                                if s3_enabled() and not s.lower().startswith("http"):
                                    return presign_get_url(s)
                                return s
                            except Exception:
                                return s

                        persona_img_norm = _norm_img(persona_img)

                        # Simple detector for image-generation requests (shared with routes)
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
                                    if s in (text or ""):
                                        return True
                            except Exception:
                                pass
                            return False

                        # Execute replies sequentially to keep load modest
                        posted_count = 0
                        for task in comment_tasks:
                            try:
                                # 0) For image-like requests, auto-generate and publish a post (Business personas)
                                if _looks_like_image_request(task.get("text", "")):
                                    auto_publish_enabled = (os.getenv("AUTO_IMAGE_AUTOPUBLISH_ENABLED", "1").strip().lower() in ("1", "true", "yes"))
                                    if auto_publish_enabled:
                                        ok = await _auto_image_publish_for_comment(
                                            client, ai_url, uid, persona_num, str(ig_user_id), str(token), task["comment_id"], task.get("text", ""), persona_img_norm, persona_params_json, sched_log
                                        )
                                        if ok:
                                            # After successful publish and ACK, skip text reply
                                            try:
                                                posted_count += 1
                                            except Exception:
                                                pass
                                            continue
                                    # If auto-publish disabled or failed, at least try best-effort image generation (no post)
                                    await _maybe_generate_image_for_comment(
                                        client, ai_url, task.get("text", ""), persona_img_norm, uid, persona_num, persona_params_json
                                    )

                                # 1) AI generate reply
                                payload = {
                                    "post_img": task["post_img"],
                                    "post": task["post"],
                                    "personality": personality or "",
                                    "text": task["text"],
                                    "persona_img": persona_img_norm,
                                }
                                ar = await client.post(f"{ai_url}/comment/reply", json=payload)
                                if ar.status_code != 200:
                                    try:
                                        sched_log.warning(f"auto-reply: AI failed status={ar.status_code} uid={uid} num={persona_num}")
                                    except Exception:
                                        pass
                                    continue
                                reply = (ar.json() or {}).get("reply") or ""
                                reply = reply.strip()
                                if not reply:
                                    try:
                                        sched_log.info(f"auto-reply: AI empty reply uid={uid} num={persona_num}")
                                    except Exception:
                                        pass
                                    continue

                                # 2) Post to Graph
                                gr = await client.post(
                                    f"{IG_GRAPH}/{task['comment_id']}/replies",
                                    data={"message": reply, "access_token": token},
                                )
                                if gr.status_code != 200:
                                    try:
                                        jb = gr.json() if gr.headers.get("content-type","" ).startswith("application/json") else {"text": gr.text}
                                    except Exception:
                                        jb = {"text": gr.text}
                                    try:
                                        sched_log.warning(f"auto-reply: Graph reply failed status={gr.status_code} uid={uid} num={persona_num} detail={jb}")
                                    except Exception:
                                        pass
                                    continue

                                # 3) ACK comment id
                                try:
                                    async with (await get_mysql_pool()).acquire() as conn:
                                        async with conn.cursor() as cur:
                                            await cur.execute(
                                                """
                                                INSERT INTO ss_instagram_event_seen (external_id, user_id, user_persona_num)
                                                VALUES (%s,%s,%s)
                                                ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP
                                                """,
                                                (str(task["comment_id"]), uid, persona_num),
                                            )
                                            try:
                                                await conn.commit()
                                            except Exception:
                                                pass
                                except Exception:
                                    pass
                                try:
                                    posted_count += 1
                                except Exception:
                                    pass
                            except Exception:
                                # Continue other comments
                                continue
                        try:
                            sched_log.info(f"auto-reply: posted={posted_count} uid={uid} num={persona_num}")
                        except Exception:
                            pass
                    except Exception:
                        # Continue other personas
                        continue
        except Exception as e:
            try:
                sched_log.warning(f"auto-reply scheduler iteration failed: {e}")
            except Exception:
                pass
        finally:
            # Sleep for configured interval without enforcing a 60s minimum,
            # so that demo/dev can run at faster cadences (e.g., 30s).
            await asyncio.sleep(interval)


async def _delayed_start_background_tasks():
    """Start background loops after a tiny delay so startup fully settles.
    This avoids rare race conditions where tasks get cancelled during ASGI lifespan.
    """
    try:
        await asyncio.sleep(1.0)
    except Exception:
        pass
    # fire-and-forget daily loop
    try:
        asyncio.create_task(_daily_snapshot_loop())
    except Exception:
        pass
    # fire-and-forget auto-reply loop
    try:
        asyncio.create_task(_auto_reply_scheduler_loop())
    except Exception:
        pass


@app.on_event("startup")
async def _start_background_tasks():
    # Start loops slightly delayed to avoid cancellation during startup
    try:
        asyncio.create_task(_delayed_start_background_tasks())
    except Exception:
        pass
