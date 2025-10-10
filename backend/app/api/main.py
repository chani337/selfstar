# app/main.py
# 1) .env를 어떤 import보다 먼저 로드
from dotenv import load_dotenv
load_dotenv(override=True)

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

# 2) 라우터 import (env 로드 이후)
from app.api.routes import auth
# posts 라우터가 있을 수도 없을 수도 있으니, 존재하면만 추가
try:
    from app.api.routes import posts  # posts.router 내부에 prefix가 있으면 main에서는 붙이지 않음
    HAS_POSTS = True
except Exception:
    HAS_POSTS = False

app = FastAPI()

# ----- CORS -----
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")
origins = [FRONTEND_URL, "http://127.0.0.1:5174"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # 배포 시 와일드카드 금지
    allow_credentials=True,     # 쿠키 전달 허용
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Session -----
# 프록시 없이 5174 -> 8000으로 직접 호출한다면 SameSite=None 필요(로컬은 http라 https_only=False)
# Vite 프록시로 같은 오리진처럼 호출하면 아래 두 옵션은 주석으로 두세요.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "selfstar-secret"),
    session_cookie=os.getenv("SESSION_COOKIE_NAME", "sid"),
    # same_site="none",   # ← 5174에서 8000을 절대경로로 직접 호출할 때만 해제
    # https_only=False,   # ← 로컬 개발용
)

# ----- Routers -----
# auth.router 내부가 APIRouter(prefix="/auth")이면 여기서는 prefix를 다시 붙이지 않습니다.
app.include_router(auth.router)

if HAS_POSTS:
    app.include_router(posts.router)      # posts.router 안에 prefix가 없으면: app.include_router(posts.router, prefix="/posts")

@app.get("/")
def root():
    return {"message": "API is running"}

# (선택) 등록된 경로 빠르게 확인
@app.get("/__routes")
def __routes():
    return sorted([getattr(r, "path", "") for r in app.router.routes])
