from fastapi import APIRouter

router = APIRouter()

try:
    from .auth import router as auth_router
    router.include_router(auth_router)
except Exception as e:
    import traceback
    print("[ERROR] ❌ auth 라우터 불러오기 실패:", e)
    traceback.print_exc()

try:
    from .posts import router as posts_router
    router.include_router(posts_router, tags=["posts"])
except Exception:
    pass

try:
    from .images import router as images_router
    router.include_router(images_router)
except Exception:
    pass

try:
    from .userdata import router as userinfo_router
    router.include_router(userinfo_router, tags=["users"])
except Exception:
    pass

try:
    from .persona import router as persona_router
    router.include_router(persona_router, tags=["personas"])
except Exception:
    pass

try:
    from .oauth_instagram import router as ig_router
    router.include_router(ig_router)
except Exception:
    pass
