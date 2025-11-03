"""
[파트 개요] 크레딧 라우터
- GET /api/credits/me: 현재 사용자 잔액/플랜
- GET /api/credits/ledger: 최근 원장
- POST /api/credits/grant: (개발 편의) 본인에게 크레딧 부여
- POST /api/credits/consume: 본인 크레딧 차감

운영에서는 grant는 관리자 전용으로 제한하세요. 여기서는 환경변수 CREDITS_ALLOW_SELF_GRANT로 제어합니다(기본 허용).
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import os

from app.api.models.credits import ensure_credit_tables, get_balance, grant_credits, consume_credits, get_ledger
from app.api.models.users import find_user_by_id, update_user_credit_plan


router = APIRouter(prefix="/api/credits", tags=["credits"])


@router.on_event("startup")
async def _ensure_tables():
    try:
        await ensure_credit_tables()
    except Exception:
        # 테이블 생성 실패는 런타임에 첫 호출 시 다시 시도될 수 있도록 무시
        pass


class GrantBody(BaseModel):
    amount: int = Field(gt=0)
    reason: str | None = None
    ref_type: str | None = None
    ref_id: str | None = None


class UpgradeBody(BaseModel):
    plan: str = Field(description="target plan, e.g., 'pro'")


@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    # user plan from ss_user
    user = await find_user_by_id(int(user_id))
    plan = user.get("user_credit") if user else None
    # ensure tables and get balance
    await ensure_credit_tables()
    bal = await get_balance(int(user_id))
    return {"ok": True, "balance": bal, "plan": plan}


@router.get("/ledger")
async def ledger(request: Request, limit: int = 50):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    await ensure_credit_tables()
    rows = await get_ledger(int(user_id), limit=limit)
    return {"ok": True, "items": rows}


@router.post("/grant")
async def grant(request: Request, body: GrantBody):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    allow_self = os.getenv("CREDITS_ALLOW_SELF_GRANT", "1").lower() in ("1", "true", "yes")
    if not allow_self:
        raise HTTPException(status_code=403, detail="Grant not allowed")
    await ensure_credit_tables()
    bal = await grant_credits(int(user_id), body.amount, body.reason, body.ref_type, body.ref_id)
    return {"ok": True, "balance": bal}


@router.post("/consume")
async def consume(request: Request, body: GrantBody):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    await ensure_credit_tables()
    try:
        bal = await consume_credits(int(user_id), body.amount, body.reason, body.ref_type, body.ref_id)
        return {"ok": True, "balance": bal}
    except RuntimeError as e:
        if str(e) == "INSUFFICIENT_CREDITS":
            raise HTTPException(status_code=402, detail="Insufficient credits")
        raise


@router.post("/upgrade")
async def upgrade_plan(request: Request, body: UpgradeBody):
    """
    임시 업그레이드 엔드포인트: 결제 완료된 것으로 간주하고 플랜을 변경.
    - 기본 정책: plan == 'pro'로 변경 허용
    - 옵션: 환경변수 CREDITS_UPGRADE_GRANT_PRO 로 초기 크레딧 부여(기본 0)
    """
    user_id = request.session.get("user_id")
    if not user_id:
        # 개발 환경에서만 쿼리 파라미터로 특정 사용자 지정 허용 (보안 위험: dev만)
        if os.getenv("DEV_ALLOW_DEBUG_USER", "0").lower() in ("1", "true", "yes"):
            q_uid = request.query_params.get("user_id")
            if q_uid and q_uid.isdigit():
                user_id = int(q_uid)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not logged in")

    plan = (body.plan or "").strip().lower()
    if plan not in ("pro", "standard", "business", "biz", "free", "basic"):
        raise HTTPException(status_code=400, detail="Invalid plan")

    # 실제 결제 검증은 생략 (임시)
    # before/after 비교용 조회
    before = await find_user_by_id(int(user_id))
    before_plan = (before or {}).get("user_credit")
    user = await update_user_credit_plan(int(user_id), plan)

    # 선택적으로 프로 업그레이드에 초기 크레딧 부여
    grant_on_upgrade = 0
    if plan == "pro":
        try:
            grant_on_upgrade = int(os.getenv("CREDITS_UPGRADE_GRANT_PRO", "0"))
        except Exception:
            grant_on_upgrade = 0
    if grant_on_upgrade > 0:
        try:
            await ensure_credit_tables()
            await grant_credits(int(user_id), grant_on_upgrade, reason="upgrade:pro", ref_type="plan", ref_id="pro")
        except Exception:
            # 초기 크레딧 부여 실패는 플랜 변경 자체를 롤백하지 않음
            pass

    after = await find_user_by_id(int(user_id))
    after_plan = (after or {}).get("user_credit")
    changed = (str(before_plan).lower() if before_plan else None) != (str(after_plan).lower() if after_plan else None)
    return {"ok": True, "plan": after_plan, "prev_plan": before_plan, "changed": changed, "granted": grant_on_upgrade}
