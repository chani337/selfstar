import os

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")
BACK_URL = os.getenv("BACK_URL", "http://localhost:8000")

# Naver OAuth 설정
NAVER_CALLBACK_URL = f"{BACK_URL}/auth/naver/callback"

# Naver OAuth는 FastAPI의 엔드포인트에서 처리됩니다.