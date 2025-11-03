"""
[파트 개요] 크레딧 모델(잔액/원장)
- 내부 통신: MySQL (aiomysql) 연결 풀을 사용
- 외부 통신: 없음

테이블 구조(자동 생성)
- ss_credit_balance(user_id PK, balance INT NOT NULL DEFAULT 0, updated_at TIMESTAMP)
- ss_credit_ledger(id PK, user_id, delta, reason, ref_type, ref_id, created_at)

주의: 실제 운영에서는 별도의 마이그레이션 도구를 권장합니다. 여기선 편의상 앱에서 IF NOT EXISTS로 생성합니다.
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
import aiomysql

from app.api.core.mysql import get_mysql_pool


CREATE_BAL_SQL = """
CREATE TABLE IF NOT EXISTS ss_credit_balance (
  user_id    INT PRIMARY KEY,
  balance    INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
"""


CREATE_LEDGER_SQL = """
CREATE TABLE IF NOT EXISTS ss_credit_ledger (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  delta      INT NOT NULL,
  reason     VARCHAR(255) NULL,
  ref_type   VARCHAR(64)  NULL,
  ref_id     VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at)
)
"""


async def ensure_credit_tables():
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(CREATE_BAL_SQL)
            await cur.execute(CREATE_LEDGER_SQL)
            await conn.commit()


async def get_balance(user_id: int) -> int:
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        # ensure row exists
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT IGNORE INTO ss_credit_balance(user_id, balance) VALUES(%s, 0)",
                (user_id,),
            )
            await conn.commit()
        async with conn.cursor(aiomysql.DictCursor) as cur2:
            await cur2.execute(
                "SELECT balance FROM ss_credit_balance WHERE user_id = %s",
                (user_id,),
            )
            row = await cur2.fetchone()
            return int(row.get("balance", 0)) if row else 0


async def grant_credits(
    user_id: int,
    amount: int,
    reason: Optional[str] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
) -> int:
    if amount <= 0:
        raise ValueError("amount must be positive")
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # upsert balance
            await cur.execute(
                """
                INSERT INTO ss_credit_balance(user_id, balance)
                VALUES(%s, %s)
                ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
                """,
                (user_id, amount),
            )
            # ledger
            await cur.execute(
                """
                INSERT INTO ss_credit_ledger(user_id, delta, reason, ref_type, ref_id)
                VALUES(%s, %s, %s, %s, %s)
                """,
                (user_id, amount, reason, ref_type, ref_id),
            )
            await conn.commit()
        # return new balance
        return await get_balance(user_id)


async def consume_credits(
    user_id: int,
    amount: int,
    reason: Optional[str] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
) -> int:
    if amount <= 0:
        raise ValueError("amount must be positive")
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # ensure row exists first
            await cur.execute(
                "INSERT IGNORE INTO ss_credit_balance(user_id, balance) VALUES(%s, 0)",
                (user_id,),
            )
            # atomic decrement only if enough balance
            await cur.execute(
                "UPDATE ss_credit_balance SET balance = balance - %s WHERE user_id = %s AND balance >= %s",
                (amount, user_id, amount),
            )
            if cur.rowcount == 0:
                # not enough balance
                await conn.commit()
                raise RuntimeError("INSUFFICIENT_CREDITS")
            # ledger
            await cur.execute(
                """
                INSERT INTO ss_credit_ledger(user_id, delta, reason, ref_type, ref_id)
                VALUES(%s, %s, %s, %s, %s)
                """,
                (user_id, -amount, reason, ref_type, ref_id),
            )
            await conn.commit()
        return await get_balance(user_id)


async def get_ledger(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit or 50), 200))
    pool = await get_mysql_pool()
    async with pool.acquire() as conn, conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute(
            """
            SELECT id, delta, reason, ref_type, ref_id, created_at
            FROM ss_credit_ledger
            WHERE user_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        rows = await cur.fetchall()
    return rows or []
