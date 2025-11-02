"""
[파트 개요] persona 모델 액세스
- 내부 통신: aiomysql 풀을 이용해 ss_persona 테이블에 INSERT
"""
from __future__ import annotations
import aiomysql
import json
from typing import Any, Dict, List
from app.api.core.mysql import get_mysql_pool
import logging

log = logging.getLogger("personas")


async def _dict_cursor(conn) -> aiomysql.cursors.DictCursor:
    return conn.cursor(aiomysql.DictCursor)


async def create_persona(
    user_id: int,
    persona_img: str,
    persona_parameters: Dict[str, Any],
) -> tuple[int, int]:
    """
    ss_persona에 새 레코드를 추가하고 생성된 PK를 반환합니다.
    """
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            # 현재 보유 개수 및 최대 user_persona_num 확인
            await cur.execute(
                """
                SELECT COUNT(*) AS cnt, COALESCE(MAX(user_persona_num), 0) AS mx
                FROM ss_persona
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = await cur.fetchone() or {"cnt": 0, "mx": 0}
            if int(row["cnt"]) >= 4:
                raise ValueError("persona_limit_reached")
            next_num = int(row["mx"]) + 1
            log.info("persona count=%s next_num=%s for user_id=%s", row.get("cnt"), next_num, user_id)

        async with conn.cursor() as cur:
            # JSON 직렬화 보장: 문자열로 변환하여 저장 (DB 컬럼 타입이 JSON이든 TEXT이든 호환)
            sql = (
                "INSERT INTO ss_persona (user_id, user_persona_num, persona_img, persona_parameters) "
                "VALUES (%s, %s, %s, %s)"
            )
            params_json = json.dumps(persona_parameters, ensure_ascii=False)
            await cur.execute(sql, (user_id, next_num, persona_img, params_json))
            try:
                await conn.commit()
            except Exception:
                # pool autocommit may be enabled; ignore commit error
                pass
            rid = cur.lastrowid or 0
            log.info("persona inserted id=%s for user_id=%s num=%s", rid, user_id, next_num)
            return rid, next_num
    
async def get_user_personas(user_id: int) -> List[Dict[str, Any]]:
    """
    사용자 ID에 대한 모든 페르소나를 반환합니다.
    """
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                """
                SELECT user_persona_num, persona_img, persona_parameters
                FROM ss_persona
                WHERE user_id = %s
                ORDER BY user_persona_num
                """,
                (user_id,),
            )
            personas = await cur.fetchall()
            for persona in personas:
                persona['persona_parameters'] = json.loads(persona['persona_parameters'])
            return personas


async def update_persona_img(user_id: int, persona_num: int, img_value: str) -> None:
    """Update persona_img for the given user and persona number.

    img_value should be an S3 key when using Object Storage, or a /media/... URL when using local storage.
    """
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE ss_persona
                SET persona_img = %s
                WHERE user_id = %s AND user_persona_num = %s
                LIMIT 1
                """,
                (img_value, user_id, persona_num),
            )
            try:
                await conn.commit()
            except Exception:
                pass


async def update_persona_fields(
    user_id: int,
    persona_num: int,
    *,
    name: str | None = None,
    persona_img: str | None = None,
    persona_parameters_patch: Dict[str, Any] | None = None,
) -> None:
    """Update persona fields safely.

    - name: stored under persona_parameters.name (non-destructive merge)
    - persona_img: replaces persona_img column (use S3 key or /media/...)
    - persona_parameters_patch: shallow-merge into persona_parameters JSON
    """
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        # Load existing JSON
        params: Dict[str, Any] = {}
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                """
                SELECT persona_parameters
                FROM ss_persona
                WHERE user_id=%s AND user_persona_num=%s
                LIMIT 1
                """,
                (user_id, persona_num),
            )
            row = await cur.fetchone()
            if row and row.get("persona_parameters"):
                try:
                    params = json.loads(row["persona_parameters"]) or {}
                except Exception:
                    params = {}

        if not isinstance(params, dict):
            params = {}
        if name is not None:
            params["name"] = name
        if isinstance(persona_parameters_patch, dict) and persona_parameters_patch:
            # shallow merge only
            params.update(persona_parameters_patch)

        # Build update statement dynamically
        sets = ["persona_parameters=%s"]
        values: List[Any] = [json.dumps(params, ensure_ascii=False)]
        if persona_img is not None:
            sets.append("persona_img=%s")
            values.append(persona_img)
        values.extend([user_id, persona_num])
        async with conn.cursor() as cur2:
            await cur2.execute(
                f"UPDATE ss_persona SET {', '.join(sets)} WHERE user_id=%s AND user_persona_num=%s LIMIT 1",
                tuple(values),
            )
            try:
                await conn.commit()
            except Exception:
                pass


async def delete_persona(user_id: int, persona_num: int) -> None:
    """Delete persona and related records owned by the user.

    This removes:
    - ss_persona row
    - ss_instagram_connector_persona token (if any)
    - ss_instagram_event_seen ACKs (best-effort)
    """
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Remove connector/token if exists
            try:
                await cur.execute(
                    "DELETE FROM ss_instagram_connector_persona WHERE user_id=%s AND user_persona_num=%s",
                    (user_id, persona_num),
                )
            except Exception:
                pass
            # Remove seen acks (best-effort)
            try:
                await cur.execute(
                    "DELETE FROM ss_instagram_event_seen WHERE user_id=%s AND user_persona_num=%s",
                    (user_id, persona_num),
                )
            except Exception:
                pass
            # Finally, remove persona
            await cur.execute(
                "DELETE FROM ss_persona WHERE user_id=%s AND user_persona_num=%s LIMIT 1",
                (user_id, persona_num),
            )
            try:
                await conn.commit()
            except Exception:
                pass
