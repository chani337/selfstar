from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.api.routes.auth import router as auth_router
from app.api.core.mysql import get_mysql_pool
import uvicorn
import logging
from dotenv import load_dotenv, dotenv_values
import os
from datetime import datetime, timezone

# Load environment variables from .env file(s)
# 1) project root .env
load_dotenv(dotenv_path=".env", override=True)
# 2) app/.env (fallback or override)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("env_loader")

# Debugging: Log .env file path and contents
logger.info("Attempting to load .env file from project root.")
try:
    with open(".env", "r", encoding="utf-8") as env_file:
        logger.info(".env file contents:\n" + env_file.read())
except FileNotFoundError:
    logger.error(".env file not found in the project root.")
except UnicodeDecodeError as e:
    logger.error(f"Failed to read .env file due to encoding error: {e}")

# Log environment variables
logger.info(f"KAKAO_CLIENT_ID: {os.getenv('KAKAO_CLIENT_ID')}")
logger.info(f"BACKEND_URL: {os.getenv('BACKEND_URL')}")
logger.info(f"FRONTEND_URL: {os.getenv('FRONTEND_URL')}")
logger.info(f"SESSION_SECRET: {os.getenv('SESSION_SECRET')}")

# Debugging: Load and log all .env values
env_values_root = dotenv_values(".env")
env_values_app = dotenv_values(os.path.join(os.path.dirname(__file__), ".env"))
logger.info(f"Loaded root .env values: {env_values_root}")
logger.info(f"Loaded app/.env values: {env_values_app}")

app = FastAPI(debug=True)

# ===== CORS =====
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")
STRICT = os.getenv("STRICT_CORS", "0") == "1"
allow_origins = [FRONTEND_URL, FRONTEND_URL.rstrip("/")] if STRICT else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Session (쿠키 기반) =====
SESSION_SECRET = os.getenv("SESSION_SECRET", "default_secret_key")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# Debugging: Log session secret and MySQL pool initialization
logger.info(f"SESSION_SECRET: {SESSION_SECRET}")
logger.info("Initializing MySQL pool...")

# ===== Routers =====
# auth_router 내부에서 prefix="/auth" 를 사용한다는 가정하에,
# 여기서는 추가 prefix를 절대 붙이지 않습니다. (중복 → /auth/auth/*)
app.include_router(auth_router)

# ===== Health =====
@app.get("/")
def root():
    return {"message": "Welcome to the API!"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# (디버그) 등록된 경로를 보려면 /__routes 로 확인 가능
@app.get("/__routes")
def routes_debug():
    return sorted(app.router.routes, key=lambda r: getattr(r, "path", ""))
    # 또는: return [getattr(r, "path", "") for r in app.router.routes]

# ===== App lifecycle =====
@app.on_event("startup")
async def startup_event():
    app.state.mysql_pool = await get_mysql_pool()

@app.on_event("shutdown")
async def shutdown_event():
    pool = app.state.mysql_pool
    pool.close()
    await pool.wait_closed()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
