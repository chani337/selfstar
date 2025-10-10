import os

KAKAO_CLIENT_ID = "7cb111d7e80f4b6d021c1c7ad8f741ec"
BACK_URL = os.getenv("BACK_URL", "http://localhost:8000")

# Kakao OAuth 설정
KAKAO_CALLBACK_URL = f"{BACK_URL}/auth/kakao/callback"

# Kakao OAuth는 FastAPI의 엔드포인트에서 처리됩니다.