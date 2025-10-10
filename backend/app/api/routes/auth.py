# FastAPI Auth Router
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
import httpx
import os
import logging
from urllib.parse import urlencode

from app.api.models.users import upsert_user_from_oauth, find_user_by_id

logger = logging.getLogger("auth")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s - %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/auth", tags=["auth"])

# ----- Env (base values) -----
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")
KAKAO_SCOPE = os.getenv("KAKAO_SCOPE", "")  # e.g. "profile_nickname,profile_image,account_email"
KAKAO_ADMIN_KEY = os.getenv("KAKAO_ADMIN_KEY")


# ----- Me -----
@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        return {"ok": True, "authenticated": False, "user": None}

    user = await find_user_by_id(int(user_id))
    if not user:
        # 세션은 있는데 DB에 없으면 세션 정리
        request.session.clear()
        return {"ok": True, "authenticated": False, "user": None}

    # 프론트에서 필요한 최소 정보만 반환
    return {
        "ok": True,
        "authenticated": True,
        "user": {
            "id": user["user_id"],
            "nick": user.get("user_nick"),
            "img": user.get("user_img"),
            "platform": user.get("user_platform"),
        },
    }


# ----- Kakao Login -----
@router.get("/kakao/login")
async def kakao_login():
    # Read dynamically to avoid stale import-time env
    KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
    KAKAO_REDIRECT_URI = os.getenv("KAKAO_REDIRECT_URI", f"{BACKEND_URL}/auth/kakao/callback")
    if not KAKAO_CLIENT_ID:
        raise HTTPException(status_code=500, detail="KAKAO_CLIENT_ID not configured")
    # Build URL with prompt=login to always show login, and optional scope
    params = {
        "response_type": "code",
        "client_id": KAKAO_CLIENT_ID,
        "redirect_uri": KAKAO_REDIRECT_URI,
        "prompt": "login",
    }
    if KAKAO_SCOPE:
        params["scope"] = KAKAO_SCOPE
    url = "https://kauth.kakao.com/oauth/authorize?" + urlencode(params)
    return RedirectResponse(url)


# ----- Kakao Callback -----
@router.get("/kakao/callback")
async def kakao_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")

    # 1) 토큰 교환
    token_url = "https://kauth.kakao.com/oauth/token"
    # Read dynamically
    KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
    KAKAO_REDIRECT_URI = os.getenv("KAKAO_REDIRECT_URI", f"{BACKEND_URL}/auth/kakao/callback")
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": KAKAO_CLIENT_ID,
        "redirect_uri": KAKAO_REDIRECT_URI,
        "code": code,
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=token_payload)
        if token_resp.status_code != 200:
            logger.error("Kakao token error [%s]: %s", token_resp.status_code, token_resp.text)
            raise HTTPException(status_code=400, detail="Failed to retrieve Kakao token")

        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Access token missing")

        # 2) 유저 정보
        user_resp = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            logger.error("Kakao userinfo error [%s]: %s", user_resp.status_code, user_resp.text)
            raise HTTPException(status_code=400, detail="Failed to retrieve Kakao user info")

        kakao_user = user_resp.json()
        logger.info(f"Kakao user data: {kakao_user}")
        inherent = str(kakao_user.get("id"))
        props = kakao_user.get("properties") or {}
        nick = props.get("nickname")
        img = props.get("profile_image")

    # 3) upsert & 세션 저장
    user_row = await upsert_user_from_oauth(
        provider="kakao", inherent=inherent, nick=nick, img=img
    )
    request.session["user_id"] = int(user_row["user_id"])  # 쿠키 세션 저장

    # 4) 프론트로 리다이렉트 (로그인 완료)
    return RedirectResponse(url=f"{FRONTEND_URL}/?login=success")


# ----- Logout -----
@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return JSONResponse({"ok": True})


# ----- Kakao Unlink (관리자키 필요) -----
@router.post("/kakao/unlink")
async def kakao_unlink(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    if not KAKAO_ADMIN_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_ADMIN_KEY not configured on server")

    # 유저 정보 조회
    user = await find_user_by_id(int(user_id))
    if not user or user.get("user_platform") != "kakao":
        raise HTTPException(status_code=400, detail="Not a Kakao-linked user")

    inherent = user.get("user_inherent")  # Kakao user id
    if not inherent:
        raise HTTPException(status_code=400, detail="Kakao user id missing")

    unlink_url = "https://kapi.kakao.com/v1/user/unlink"
    headers = {"Authorization": f"KakaoAK {KAKAO_ADMIN_KEY}"}
    data = {"target_id_type": "user_id", "target_id": inherent}

    async with httpx.AsyncClient() as client:
        resp = await client.post(unlink_url, headers=headers, data=data)
        if resp.status_code != 200:
            logger.error("Kakao unlink error [%s]: %s", resp.status_code, resp.text)
            raise HTTPException(status_code=400, detail="Failed to unlink Kakao user")

    # 세션 정리(선택)
    request.session.clear()
    return {"ok": True, "unlinked": True}
