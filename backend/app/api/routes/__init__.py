from fastapi import APIRouter

router = APIRouter()

# 하위 라우터를 발견하면 자동으로 포함
try:
    from .auth import router as auth_router
    router.include_router(auth_router, prefix="/auth", tags=["auth"])
except Exception:
    pass

try:
    from .posts import router as posts_router
    router.include_router(posts_router, tags=["posts"])
except Exception:
    pass
