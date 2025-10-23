"""
[파트 개요] 인증(OAuth) 라우터
- 프론트 통신: /auth/* 엔드포인트로 로그인/콜백/세션 관리
- 외부 통신: Kakao/Google OAuth 서버와 토큰 교환 및 사용자 정보 조회
"""

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
import httpx
import os
import logging
from urllib.parse import urlencode
from typing import Optional

from app.api.models.users import upsert_user_from_oauth, find_user_by_id

logger = logging.getLogger("auth")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s - %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/auth", tags=["auth"])

# ----- 환경 변수(기본값 포함) -----
BACKEND_URL = os.getenv("BACKEND_URL", "https://selfstar.duckdns.org/api")  # ✅ 도메인으로 변경
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://selfstar.duckdns.org")
KAKAO_SCOPE = os.getenv("KAKAO_SCOPE", "profile_nickname,profile_image")  # 이메일 제외
KAKAO_ADMIN_KEY = os.getenv("KAKAO_ADMIN_KEY")
GOOGLE_SCOPE = os.getenv("GOOGLE_SCOPE", "openid email profile")
AUTH_ALWAYS_HOME = os.getenv("AUTH_ALWAYS_HOME", "1").lower() in ("1", "true", "yes")


# ----- 동의(생일 등) 필요 여부 판단 -----
def _needs_consent(user_row: Optional[dict]) -> bool:
    try:
        if not user_row:
            return False
        b = user_row.get("user_birthday")
        if not b:
            return True
        if isinstance(b, str) and b.strip() in {"", "0000-00-00", "0000-00-00 00:00:00"}:
            return True
        return False
    except Exception:
        # 보수적으로 실패 시 동의 필요로 보지 않음
        return False


# ----- Me (세션 기반 본인 확인) -----
@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        return {"ok": True, "authenticated": False, "user": None}

    user = await find_user_by_id(int(user_id))
    if not user:
        request.session.clear()
        return {"ok": True, "authenticated": False, "user": None}

    return {
        "ok": True,
        "authenticated": True,
        "user": {
            "id": user["user_id"],
            "nick": user.get("user_nick"),
            "img": user.get("user_img"),
            "platform": user.get("user_platform"),
            "credit": user.get("user_credit"),
            # 프론트가 필요 시 라우팅 판단에 사용할 수 있도록 노출
            "needs_consent": _needs_consent(user),
        },
    }


# ----- 카카오 로그인 -----
@router.get("/kakao/login")
async def kakao_login():
    kakao_client_id = os.getenv("KAKAO_CLIENT_ID")
    kakao_redirect_uri = os.getenv("KAKAO_REDIRECT_URI", f"{BACKEND_URL}/auth/kakao/callback")
    if not kakao_client_id:
        raise HTTPException(status_code=500, detail="KAKAO_CLIENT_ID not configured")

    params = {
        "response_type": "code",
        "client_id": kakao_client_id,
        "redirect_uri": kakao_redirect_uri,
        "prompt": "login",
    }
    if KAKAO_SCOPE:
        scope_tokens = [t.strip() for t in KAKAO_SCOPE.split(",") if t.strip() and "email" not in t.strip().lower()]
        if scope_tokens:
            params["scope"] = ",".join(scope_tokens)
    url = "https://kauth.kakao.com/oauth/authorize?" + urlencode(params)
    return RedirectResponse(url)


@router.get("/kakao")
async def kakao_login_alias():
    return await kakao_login()


# ----- 카카오 콜백 -----
@router.get("/kakao/callback")
async def kakao_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")

    token_url = "https://kauth.kakao.com/oauth/token"
    kakao_client_id = os.getenv("KAKAO_CLIENT_ID")
    kakao_redirect_uri = os.getenv("KAKAO_REDIRECT_URI", f"{BACKEND_URL}/auth/kakao/callback")
    kakao_client_secret = os.getenv("KAKAO_CLIENT_SECRET")
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": kakao_client_id,
        "redirect_uri": kakao_redirect_uri,
        "code": code,
    }
    if kakao_client_secret:
        token_payload["client_secret"] = kakao_client_secret

    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(token_url, data=token_payload)
            if token_resp.status_code != 200:
                logger.error("Kakao token error [%s]: %s", token_resp.status_code, token_resp.text)
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token")
            access_token = token_resp.json().get("access_token")
            if not access_token:
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token_missing")

            #user_resp = await client.get(
               # "https://kapi.kakao.com/v2/user/me",
               # headers={"Authorization": f"Bearer {access_token}"},
            #)
        request.session["user_id"] = int(user_row["user_id"])

        response = RedirectResponse(url=f"{FRONTEND_URL}/auth/success", status_code=302)
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            secure=True,                     # ✅ HTTPS 환경에서는 필수
            samesite="none",                 # ✅ 다른 도메인 간 쿠키 공유 가능
            path="/",
        )
        return response


            # if user_resp.status_code != 200:
                # logger.error("Kakao userinfo error [%s]: %s", user_resp.status_code, user_resp.text)
                # return RedirectResponse(url=f"{FRONTEND_URL}/")

            # kakao_user = user_resp.json()
            # inherent = str(kakao_user.get("id"))
            # props = kakao_user.get("properties") or {}
            # nick = props.get("nickname")
            # img = props.get("profile_image")
    except Exception as e:
        logger.error("Kakao HTTP error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=http")

    try:
        user_row = await upsert_user_from_oauth(provider="kakao", inherent=inherent, nick=nick, img=img)
    except Exception as e:
        logger.error("Kakao upsert error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=upsert")

    request.session["user_id"] = int(user_row["user_id"])  # 쿠키 세션 저장
    # 동의 필요(생일 등) 시 동의 페이지 우선 이동
    if _needs_consent(user_row) or user_row.get("is_new"):
        return RedirectResponse(url=f"{FRONTEND_URL}/consent")
    # 그 외 기본 정책
    if AUTH_ALWAYS_HOME:
        return RedirectResponse(url=f"{FRONTEND_URL}/")
    return RedirectResponse(url=f"{FRONTEND_URL}/")


# ----- 로그아웃 -----
@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return JSONResponse({"ok": True})


# ----- 카카오 연결 해제(관리자키 필요) -----
@router.post("/kakao/unlink")
async def kakao_unlink(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    if not KAKAO_ADMIN_KEY:
        raise HTTPException(status_code=500, detail="KAKAO_ADMIN_KEY not configured on server")

    user = await find_user_by_id(int(user_id))
    if not user or user.get("user_platform") != "kakao":
        raise HTTPException(status_code=400, detail="Not a Kakao-linked user")

    inherent = user.get("user_inherent")
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

    request.session.clear()
    return {"ok": True, "unlinked": True}


# ----- 구글 로그인 -----
@router.get("/google/login")
async def google_login():
    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not google_client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")

    google_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", f"{BACKEND_URL}/auth/google/callback")
    params = {
        "response_type": "code",
        "client_id": google_client_id,
        "redirect_uri": google_redirect_uri,
        "scope": GOOGLE_SCOPE,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return RedirectResponse(url)


@router.get("/google")
async def google_login_alias():
    return await google_login()


# ----- 구글 콜백 -----
@router.get("/google/callback")
async def google_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")

    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    google_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", f"{BACKEND_URL}/auth/google/callback")

    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": google_client_id,
        "client_secret": google_client_secret,
        "redirect_uri": google_redirect_uri,
        "code": code,
    }

    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(token_url, data=token_payload, headers={"Accept": "application/json"})
            if token_resp.status_code != 200:
                logger.error("Google token error [%s]: %s", token_resp.status_code, token_resp.text)
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token")
            access_token = token_resp.json().get("access_token")
            if not access_token:
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token_missing")

            userinfo_resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if userinfo_resp.status_code != 200:
                logger.error("Google userinfo error [%s]: %s", userinfo_resp.status_code, userinfo_resp.text)
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_userinfo")

            info = userinfo_resp.json()
            sub = str(info.get("sub"))
            name = info.get("name") or info.get("given_name") or info.get("email")
            picture = info.get("picture")
    except Exception as e:
        logger.error("Google HTTP error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=http")

    try:
        user_row = await upsert_user_from_oauth(provider="google", inherent=sub, nick=name, img=picture)
    except Exception as e:
        logger.error("Google upsert error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=upsert")


    request.session["user_id"] = int(user_row["user_id"])  # 쿠키 세션 저장
    if _needs_consent(user_row) or user_row.get("is_new"):
        return RedirectResponse(url=f"{FRONTEND_URL}/consent")
    if AUTH_ALWAYS_HOME:
        return RedirectResponse(url=f"{FRONTEND_URL}/")
    return RedirectResponse(url=f"{FRONTEND_URL}/")


@router.get("/naver")
async def naver_login_alias():
    return await naver_login()


# ----- 네이버 로그인 -----
@router.get("/naver/login")
async def naver_login():
    naver_client_id = os.getenv("NAVER_CLIENT_ID")
    naver_redirect_uri = os.getenv("NAVER_REDIRECT_URI", f"{BACKEND_URL}/auth/naver/callback")
    if not naver_client_id:
        raise HTTPException(status_code=500, detail="NAVER_CLIENT_ID not configured")
    params = {
        "response_type": "code",
        "client_id": naver_client_id,
        "redirect_uri": naver_redirect_uri,
        "state": "selfstar-login",
    }
    url = "https://nid.naver.com/oauth2.0/authorize?" + urlencode(params)
    return RedirectResponse(url)

# ----- 네이버 콜백 -----
@router.get("/naver/callback")
async def naver_callback(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")
    naver_client_id = os.getenv("NAVER_CLIENT_ID")
    naver_client_secret = os.getenv("NAVER_CLIENT_SECRET")
    naver_redirect_uri = os.getenv("NAVER_REDIRECT_URI", f"{BACKEND_URL}/auth/naver/callback")
    token_url = "https://nid.naver.com/oauth2.0/token"
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": naver_client_id,
        "client_secret": naver_client_secret,
        "code": code,
        "state": state,
        "redirect_uri": naver_redirect_uri,
    }
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(token_url, data=token_payload)
            if token_resp.status_code != 200:
                logger.error("Naver token error [%s]: %s", token_resp.status_code, token_resp.text)
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token")
            token_json = token_resp.json()
            access_token = token_json.get("access_token")
            if not access_token:
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_token_missing")
            userinfo_resp = await client.get(
                "https://openapi.naver.com/v1/nid/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if userinfo_resp.status_code != 200:
                logger.error("Naver userinfo error [%s]: %s", userinfo_resp.status_code, userinfo_resp.text)
                return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=oauth_userinfo")
            info = userinfo_resp.json().get("response", {})
            naver_id = str(info.get("id"))
            name = info.get("name") or info.get("nickname") or info.get("email")
            picture = info.get("profile_image")
    except Exception as e:
        logger.error("Naver HTTP error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=http")
    try:
        user_row = await upsert_user_from_oauth(provider="naver", inherent=naver_id, nick=name, img=picture)
    except Exception as e:
        logger.error("Naver upsert error: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/signup?error=upsert")
      
    request.session["user_id"] = int(user_row["user_id"])
    if _needs_consent(user_row) or user_row.get("is_new"):
        return RedirectResponse(url=f"{FRONTEND_URL}/consent")
    if AUTH_ALWAYS_HOME:
        return RedirectResponse(url=f"{FRONTEND_URL}/")
    return RedirectResponse(url=f"{FRONTEND_URL}/")
