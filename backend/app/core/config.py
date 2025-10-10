import os
from dotenv import load_dotenv

# Load .env from backend root and app folder (backend/app)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"), override=True)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)

class Settings:
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5174")
    STRICT_CORS: bool = os.getenv("STRICT_CORS", "0") == "1"
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "default_secret_key")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")

settings = Settings()
