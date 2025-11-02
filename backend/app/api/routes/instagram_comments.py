from __future__ import annotations
import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request
import httpx
import logging

# 내부 OAuth/연동 유틸 재사용
from .oauth_instagram import (
    GRAPH as IG_GRAPH,
    _require_login,               # 세션에서 user_id 확인
    _get_persona_token,           # 페르소나별 long-lived user token 조회
    _get_persona_instagram_mapping,  # ss_persona에 저장된 IG 매핑(ig_user_id/fb_page_id)
)
from app.api.models.persona import get_user_personas as _get_user_personas
from app.core.s3 import s3_enabled, presign_get_url
from app.api.core.mysql import get_mysql_pool
import aiomysql
from datetime import datetime, timedelta


router = APIRouter(prefix="/api/instagram", tags=["instagram"])
log = logging.getLogger("instagram_comments")


async def _fetch_recent_media_and_comments(
    client: httpx.AsyncClient,
    ig_user_id: str,
    access_token: str,
    media_limit: int = 5,
    comments_limit: int = 10,
    return_debug: bool = False,
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """지정 IG 사용자에 대한 최근 미디어와 각 미디어의 최신 댓글 수집.

    반환 items 요소:
    {
      "media_id", "caption", "permalink", "media_type", "media_url", "thumbnail_url", "timestamp",
      "comments": [ { "id", "text", "username", "timestamp", "like_count" } ]
    }
    """
    # 1) 최근 미디어 조회
    media_items: List[Dict[str, Any]] = []
    r = await client.get(
        f"{IG_GRAPH}/{ig_user_id}/media",
        params={
            "access_token": access_token,
            "fields": "id,caption,permalink,media_type,media_url,thumbnail_url,timestamp",
            "limit": max(1, int(media_limit)),
        },
    )
    debug_info: Optional[Dict[str, Any]] = None
    if r.status_code != 200:
        # 미디어 접근 불가 — 상태/본문 로깅 및 디버그 수집
        try:
            body = r.json()
        except Exception:
            body = {"text": r.text}
        log.warning("IG media fetch failed: status=%s body=%s", r.status_code, body)
        if return_debug:
            debug_info = {"media_status": r.status_code, "media_body": body}
        return ([], debug_info)
    data = (r.json() or {}).get("data") or []

    for m in data:
        mid = m.get("id")
        if not mid:
            continue
        item = {
            "media_id": mid,
            "caption": m.get("caption"),
            "permalink": m.get("permalink"),
            "media_type": m.get("media_type"),
            "media_url": m.get("media_url"),
            "thumbnail_url": m.get("thumbnail_url"),
            "timestamp": m.get("timestamp"),
            "comments": [],
        }
        # 2) 각 미디어의 댓글 조회
        cr = await client.get(
            f"{IG_GRAPH}/{mid}/comments",
            params={
                "access_token": access_token,
                # username/text/timestamp/like_count 정도만 사용 (일반 코멘터의 프로필 이미지/ID는 제공되지 않음)
                "fields": "id,text,username,timestamp,like_count",
                "limit": max(1, int(comments_limit)),
            },
        )
        comments: List[Dict[str, Any]] = []
        if cr.status_code == 200:
            comments = (cr.json() or {}).get("data") or []
        else:
            try:
                cbody = cr.json()
            except Exception:
                cbody = {"text": cr.text}
            log.warning("IG comments fetch failed: media_id=%s status=%s body=%s", mid, cr.status_code, cbody)
            if return_debug:
                if debug_info is None:
                    debug_info = {}
                debug_info.setdefault("comments", []).append({
                    "media_id": mid,
                    "status": cr.status_code,
                    "body": cbody,
                })
        # 정규화해서 담기
        item["comments"] = [
            {
                "id": c.get("id"),
                "text": c.get("text"),
                "username": c.get("username"),
                "timestamp": c.get("timestamp"),
                "like_count": c.get("like_count"),
            }
            for c in comments
            if c.get("id")
        ]
        media_items.append(item)
    return (media_items, debug_info)


# ===== Instagram posts endpoints for MyPage =====
@router.get("/posts")
async def list_posts(request: Request, persona_num: Optional[int] = None, limit: int = 18):
    """Return recently stored posts for persona from DB.

    Use /api/instagram/posts/sync to refresh cache from Graph.
    """
    uid = _require_login(request)
    if persona_num is None:
        raise HTTPException(status_code=400, detail="persona_num_required")

    items: List[Dict[str, Any]] = []
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                rows = []
                try:
                    await cur.execute(
                        """
                        SELECT media_id, media_type, media_product_type, media_url, thumbnail_url,
                               permalink, caption, posted_at, like_count, comments_count
                        FROM ss_instagram_post
                        WHERE user_id=%s AND user_persona_num=%s
                        ORDER BY (posted_at IS NULL) ASC, posted_at DESC, updated_at DESC
                        LIMIT %s
                        """,
                        (int(uid), int(persona_num), int(limit)),
                    )
                    rows = await cur.fetchall() or []
                except Exception as _e:
                    # 테이블 미존재 또는 권한 문제 시 빈 배열 반환(프로덕션 안전)
                    rows = []
        for r in rows:
            ts = r.get("posted_at")
            if ts:
                try:
                    timestamp = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                except Exception:
                    timestamp = None
            else:
                timestamp = None
            items.append(
                {
                    "id": r.get("media_id"),
                    "media_type": r.get("media_type"),
                    "media_url": r.get("media_url"),
                    "thumbnail_url": r.get("thumbnail_url"),
                    "permalink": r.get("permalink"),
                    "caption": r.get("caption"),
                    "timestamp": timestamp,
                    "like_count": r.get("like_count") or 0,
                    "comments_count": r.get("comments_count") or 0,
                }
            )
        return {"ok": True, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"posts_list_failed:{e}")


@router.post("/posts/sync")
async def sync_posts(
    request: Request,
    persona_num: Optional[int] = None,
    limit: int = 18,
    days: Optional[int] = None,
    prune_missing: bool = True,
):
    """Fetch recent posts from Graph and upsert into DB for this persona.

    Behavior:
    - Upserts the most recent posts returned by Graph API.
    - If `days` is provided, adds `since` to Graph query and PRUNES local cached posts within that window
      that are not returned by Graph (handles 'deleted on Instagram' cases).
    - If `days` is not provided and `prune_missing=True`, prunes only among the latest `limit` local rows.
    """
    uid = _require_login(request)
    if persona_num is None:
        raise HTTPException(status_code=400, detail="persona_num_required")

    mapping = await _get_persona_instagram_mapping(int(uid), int(persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        return {"ok": True, "synced": 0}
    token = await _get_persona_token(int(uid), int(persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            params = {
                "access_token": token,
                "fields": "id,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count",
                "limit": max(1, int(limit)),
            }
            if days and isinstance(days, int) and days > 0:
                params["since"] = (datetime.utcnow() - timedelta(days=int(days))).strftime('%Y-%m-%d')
            r = await client.get(
                f"{IG_GRAPH}/{mapping['ig_user_id']}/media",
                params=params,
            )
        if r.status_code != 200:
            try:
                body = r.json()
                err = (body or {}).get("error") or {}
                if err.get("code") == 190:
                    raise HTTPException(status_code=401, detail="persona_oauth_required")
            except HTTPException:
                raise
            except Exception:
                pass
            if r.status_code == 404:
                return {"ok": True, "synced": 0}
            raise HTTPException(status_code=r.status_code, detail=r.text)

        data = (r.json() or {}).get("data") or []
        # Even if empty, continue to possible prune step below when days provided

        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                upcnt = 0
                fetched_ids: set[str] = set()
                for m in data:
                    mid = m.get("id")
                    if not mid:
                        continue
                    try:
                        fetched_ids.add(str(mid))
                    except Exception:
                        pass
                    media_type = m.get("media_type")
                    product_type = m.get("media_product_type")
                    media_url = m.get("media_url")
                    thumbnail_url = m.get("thumbnail_url")
                    permalink = m.get("permalink")
                    caption = m.get("caption")
                    timestamp = m.get("timestamp")
                    like_count = int(m.get("like_count") or 0)
                    comments_count = int(m.get("comments_count") or 0)
                    # Normalize timestamp to MySQL DATETIME string
                    posted_at = None
                    if isinstance(timestamp, str):
                        # IG returns ISO 8601; MySQL accepts 'YYYY-MM-DD HH:MM:SS'
                        try:
                            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                            posted_at = dt.strftime("%Y-%m-%d %H:%M:%S")
                        except Exception:
                            posted_at = None
                    try:
                        await cur.execute(
                            """
                            INSERT INTO ss_instagram_post (
                              media_id, user_id, user_persona_num, ig_user_id,
                              media_type, media_product_type, media_url, thumbnail_url,
                              permalink, caption, posted_at, like_count, comments_count
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            ON DUPLICATE KEY UPDATE
                              media_type=VALUES(media_type),
                              media_product_type=VALUES(media_product_type),
                              media_url=VALUES(media_url),
                              thumbnail_url=VALUES(thumbnail_url),
                              permalink=VALUES(permalink),
                              caption=VALUES(caption),
                              posted_at=VALUES(posted_at),
                              like_count=GREATEST(VALUES(like_count), like_count),
                              comments_count=GREATEST(VALUES(comments_count), comments_count),
                              updated_at=CURRENT_TIMESTAMP
                            """,
                            (
                                str(mid), int(uid), int(persona_num), str(mapping["ig_user_id"]),
                                media_type, product_type, media_url, thumbnail_url,
                                permalink, caption, posted_at, like_count, comments_count,
                            ),
                        )
                        upcnt += 1
                    except Exception:
                        # Continue on individual failure
                        pass
                pruned = 0
                if prune_missing:
                    try:
                        if days and isinstance(days, int) and days > 0:
                            # Prune within the since window: rows not in fetched_ids
                            since_dt = (datetime.utcnow() - timedelta(days=int(days)))
                            since_str = since_dt.strftime("%Y-%m-%d %H:%M:%S")
                            # Collect local ids in window
                            await cur.execute(
                                """
                                SELECT media_id FROM ss_instagram_post
                                WHERE user_id=%s AND user_persona_num=%s AND (posted_at IS NULL OR posted_at >= %s)
                                """,
                                (int(uid), int(persona_num), since_str),
                            )
                            rows = await cur.fetchall() or []
                            local_ids = {str(r[0]) if not isinstance(r, dict) else str(r.get('media_id')) for r in rows}
                            to_delete = [i for i in local_ids if i and i not in fetched_ids]
                            if to_delete:
                                ph = ",".join(["%s"] * len(to_delete))
                                await cur.execute(
                                    f"DELETE FROM ss_instagram_post WHERE user_id=%s AND user_persona_num=%s AND media_id IN ({ph})",
                                    (int(uid), int(persona_num), *to_delete),
                                )
                                pruned = cur.rowcount or 0
                        else:
                            # No days: prune among top-N recent locals
                            await cur.execute(
                                """
                                SELECT media_id FROM ss_instagram_post
                                WHERE user_id=%s AND user_persona_num=%s
                                ORDER BY (posted_at IS NULL) ASC, posted_at DESC, updated_at DESC
                                LIMIT %s
                                """,
                                (int(uid), int(persona_num), int(limit)),
                            )
                            rows = await cur.fetchall() or []
                            local_ids = {str(r[0]) if not isinstance(r, dict) else str(r.get('media_id')) for r in rows}
                            to_delete = [i for i in local_ids if i and i not in fetched_ids]
                            if to_delete:
                                ph = ",".join(["%s"] * len(to_delete))
                                await cur.execute(
                                    f"DELETE FROM ss_instagram_post WHERE user_id=%s AND user_persona_num=%s AND media_id IN ({ph})",
                                    (int(uid), int(persona_num), *to_delete),
                                )
                                pruned = cur.rowcount or 0
                    except Exception:
                        pruned = 0
                try:
                    await conn.commit()
                except Exception:
                    pass
        return {"ok": True, "synced": upcnt, "pruned": pruned}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"posts_sync_failed:{e}")


@router.delete("/posts/{media_id}")
async def delete_post(
    request: Request,
    media_id: str,
    persona_num: Optional[int] = None,
    local_only: bool = False,
):
    """Remove a post from our cache and best-effort delete on Instagram.

    Note: Instagram Graph API does not support deleting published media. We therefore:
    - Attempt a DELETE call (will return not-supported), then
    - Always delete the local cached record so it disappears from MyPage

    Use `local_only=true` to skip any network attempt and only purge locally.
    """
    uid = _require_login(request)
    if persona_num is None:
        raise HTTPException(status_code=400, detail="persona_num_required")

    deleted_on_instagram = False
    if not local_only:
        # Try best-effort DELETE even though API says unsupported, in case of future support.
        try:
            mapping = await _get_persona_instagram_mapping(int(uid), int(persona_num))
            token = await _get_persona_token(int(uid), int(persona_num))
            if mapping and token and media_id:
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.delete(f"{IG_GRAPH}/{media_id}", params={"access_token": token})
                if r.status_code in (200, 204):
                    deleted_on_instagram = True
                else:
                    # Likely not supported: log and continue to local purge
                    try:
                        body = r.json()
                    except Exception:
                        body = {"text": r.text}
                    log.info("IG delete not supported or failed: media_id=%s status=%s body=%s", media_id, r.status_code, body)
        except Exception as e:
            # Network or other error; proceed with local delete
            log.warning("IG delete attempt failed: %s", e)

    # Always delete local cache so it's removed from UI
    try:
        pool = await get_mysql_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                try:
                    await cur.execute(
                        "DELETE FROM ss_instagram_post WHERE user_id=%s AND user_persona_num=%s AND media_id=%s",
                        (int(uid), int(persona_num), str(media_id)),
                    )
                except Exception:
                    pass
                try:
                    await conn.commit()
                except Exception:
                    pass
    except Exception as e:
        log.warning("local cache delete failed: %s", e)

    return {"ok": True, "deleted_on_instagram": bool(deleted_on_instagram)}


@router.get("/comments/overview")
async def comments_overview(
    request: Request,
    media_limit: int = 5,
    comments_limit: int = 10,
    exclude_seen: bool = True,
    debug: bool = False,
):
    """현재 로그인 사용자의 '연동된' 페르소나별 최근 댓글 개요를 반환.

    - 각 페르소나에 대해 최근 N개의 미디어와 각 미디어의 최근 M개의 댓글을 포함
    - 토큰 또는 매핑이 없는 페르소나는 생략
    """
    user_id = _require_login(request)

    # 사용자 페르소나 조회
    personas = await _get_user_personas(int(user_id))
    if not personas:
        return {"ok": True, "personas": []}

    results: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for p in personas:
            num = p.get("user_persona_num")
            if num is None:
                continue
            # IG 매핑/토큰 검사
            mapping = await _get_persona_instagram_mapping(int(user_id), int(num))
            if not mapping or not mapping.get("ig_user_id"):
                continue
            token = await _get_persona_token(int(user_id), int(num))
            if not token:
                continue

            media, dbg = await _fetch_recent_media_and_comments(
                client,
                mapping["ig_user_id"],
                token,
                media_limit=media_limit,
                comments_limit=comments_limit,
                return_debug=bool(debug),
            )

            # 선택적으로 '확인된(ack)' 알림은 제외
            if exclude_seen and media:
                try:
                    # 댓글 ID 수집
                    all_comment_ids: List[str] = []
                    for m in media:
                        for c in m.get("comments") or []:
                            cid = c.get("id")
                            if isinstance(cid, str):
                                all_comment_ids.append(cid)
                    # 없으면 건너뜀
                    if all_comment_ids:
                        # IN 절은 너무 길어지지 않도록 100개 단위로 분할
                        seen_ids: set[str] = set()
                        pool = await get_mysql_pool()
                        chunks = [all_comment_ids[i:i+100] for i in range(0, len(all_comment_ids), 100)]
                        async with pool.acquire() as conn:
                            async with conn.cursor(aiomysql.DictCursor) as cur:
                                for chunk in chunks:
                                    ph = ",".join(["%s"] * len(chunk))
                                    try:
                                        await cur.execute(
                                            f"""
                                            SELECT external_id
                                            FROM ss_instagram_event_seen
                                            WHERE external_id IN ({ph})
                                            """,
                                            chunk,
                                        )
                                        for r in (await cur.fetchall()) or []:
                                            sid = r.get("external_id")
                                            if isinstance(sid, str):
                                                seen_ids.add(sid)
                                    except Exception:
                                        # 테이블 미존재 등은 무시하고 전체 반환
                                        seen_ids = set()
                                        break
                        if seen_ids:
                            # 각 미디어의 comments에서 seen_ids 제거
                            for m in media:
                                cs = m.get("comments") or []
                                m["comments"] = [c for c in cs if c.get("id") not in seen_ids]
                except Exception:
                    # 필터링 실패 시 원본 반환(치명적 아님)
                    pass

            # 표시용 이름/이미지
            params = p.get("persona_parameters") or {}
            disp_name = params.get("name") or f"프로필 {num}"
            persona_img = p.get("persona_img")
            # Normalize persona_img for browser use: presign S3 keys and fix legacy localhost URLs
            try:
                s = str(persona_img) if persona_img is not None else ""
                if s and not s.lower().startswith("http") and not s.startswith("data:") and not s.startswith("/"):
                    if s3_enabled():
                        persona_img = presign_get_url(s)
                elif s.lower().startswith("http://localhost") or s.lower().startswith("http://127.0.0.1"):
                    from urllib.parse import urlparse
                    purl = urlparse(s)
                    path = purl.path or ""
                    if path.startswith("/personas/") or path.startswith("/uploads/"):
                        if s3_enabled():
                            persona_img = presign_get_url(path.lstrip("/"))
                        else:
                            backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                            persona_img = f"{backend_url}{path}"
                    elif path.startswith("/media/"):
                        backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                        persona_img = f"{backend_url}{path}"
                    else:
                        backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                        persona_img = f"{backend_url}{path or '/'}"
            except Exception:
                pass

            results.append(
                {
                    "persona_num": num,
                    "persona_name": disp_name,
                    "persona_img": persona_img,
                    "ig_user_id": mapping.get("ig_user_id"),
                    "ig_username": mapping.get("ig_username"),
                    "items": media,
                    **({"debug": dbg} if debug and dbg is not None else {}),
                }
            )

    return {"ok": True, "personas": results}


@router.get("/comments/raw")
async def debug_comments_raw(
    request: Request,
    persona_num: int,
    media_limit: int = 1,
    comments_limit: int = 10,
):
    """Raw Graph proxy for debugging comment fetch failures.

    - Does not touch DB and does not filter; returns raw Graph status/body.
    - Use this to see exact error payloads from Meta Graph API.
    """
    uid = _require_login(request)

    mapping = await _get_persona_instagram_mapping(int(uid), int(persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    out: Dict[str, Any] = {
        "ok": True,
        "persona_num": int(persona_num),
        "ig_user_id": mapping.get("ig_user_id"),
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            mr = await client.get(
                f"{IG_GRAPH}/{mapping['ig_user_id']}/media",
                params={
                    "access_token": token,
                    "fields": "id,caption,permalink,media_type,media_url,thumbnail_url,timestamp",
                    "limit": max(1, int(media_limit)),
                },
            )
            try:
                media_body = mr.json()
            except Exception:
                media_body = {"text": mr.text}
            out["media"] = {"status": mr.status_code, "body": media_body}

            comments_raw: List[Dict[str, Any]] = []
            if mr.status_code == 200:
                data = (media_body or {}).get("data") or []
                for m in data:
                    mid = m.get("id")
                    if not mid:
                        continue
                    cr = await client.get(
                        f"{IG_GRAPH}/{mid}/comments",
                        params={
                            "access_token": token,
                            "fields": "id,text,username,timestamp,like_count",
                            "limit": max(1, int(comments_limit)),
                        },
                    )
                    try:
                        cbody = cr.json()
                    except Exception:
                        cbody = {"text": cr.text}
                    comments_raw.append({
                        "media_id": mid,
                        "status": cr.status_code,
                        "body": cbody,
                    })
            out["comments"] = comments_raw
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"comments_raw_failed:{e}")


@router.get("/media/{media_id}/comments")
async def get_media_comments(
    request: Request,
    media_id: str,
    persona_num: Optional[int] = None,
    limit: int = 50,
    include_replies: bool = True,
    replies_limit: int = 10,
):
    """Return recent comments for a specific media.

    - persona_num is required to use the correct linked IG token
    - include_replies optionally fetches a few replies for each top-level comment
    """
    uid = _require_login(request)
    if persona_num is None:
        raise HTTPException(status_code=400, detail="persona_num_required")

    # Ensure persona is linked and token is available
    mapping = await _get_persona_instagram_mapping(int(uid), int(persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_not_linked")
    token = await _get_persona_token(int(uid), int(persona_num))
    if not token:
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch top-level comments
            cr = await client.get(
                f"{IG_GRAPH}/{media_id}/comments",
                params={
                    "access_token": token,
                    "fields": "id,text,username,timestamp,like_count",
                    "limit": max(1, int(limit)),
                },
            )
            if cr.status_code != 200:
                try:
                    err = (cr.json() or {}).get("error") or {}
                    if err.get("code") == 190:
                        raise HTTPException(status_code=401, detail="persona_oauth_required")
                except HTTPException:
                    raise
                except Exception:
                    pass
                raise HTTPException(status_code=cr.status_code, detail=cr.text)

            comments = (cr.json() or {}).get("data") or []
            items: List[Dict[str, Any]] = []
            for c in comments:
                cid = c.get("id")
                if not cid:
                    continue
                item = {
                    "id": cid,
                    "text": c.get("text"),
                    "username": c.get("username"),
                    "timestamp": c.get("timestamp"),
                    "like_count": c.get("like_count"),
                }
                # Optionally fetch replies for each comment
                if include_replies:
                    try:
                        rr = await client.get(
                            f"{IG_GRAPH}/{cid}/replies",
                            params={
                                "access_token": token,
                                "fields": "id,text,username,timestamp,like_count",
                                "limit": max(1, int(replies_limit)),
                            },
                        )
                        if rr.status_code == 200:
                            reps = (rr.json() or {}).get("data") or []
                            item["replies"] = [
                                {
                                    "id": r.get("id"),
                                    "text": r.get("text"),
                                    "username": r.get("username"),
                                    "timestamp": r.get("timestamp"),
                                    "like_count": r.get("like_count"),
                                }
                                for r in reps
                                if r.get("id")
                            ]
                        else:
                            item["replies"] = []
                    except Exception:
                        item["replies"] = []
                items.append(item)

        return {"ok": True, "items": items}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"media_comments_failed:{e}")
