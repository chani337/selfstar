import os

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
BACK_URL = os.getenv("BACK_URL", "http://localhost:8000")

# Google OAuth 설정
GOOGLE_CALLBACK_URL = f"{BACK_URL}/auth/google/callback"

# Google OAuth는 FastAPI의 엔드포인트에서 처리됩니다.