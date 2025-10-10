from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
import logging
from dotenv import load_dotenv, dotenv_values
import os
from datetime import datetime, timezone
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.health import HealthResponse

# Load environment variables from .env file(s)
# 1) project root .env
load_dotenv(dotenv_path=".env", override=True)
# 2) app/.env (fallback or override)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)

# Set up logging
logger = get_logger("env_loader")

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
FRONTEND_URL = settings.FRONTEND_URL
STRICT = settings.STRICT_CORS
allow_origins = [FRONTEND_URL, FRONTEND_URL.rstrip("/")] if STRICT else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Session (쿠키 기반) =====
SESSION_SECRET = settings.SESSION_SECRET
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# Debugging: Log session secret and MySQL pool initialization
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
@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse.ok()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
