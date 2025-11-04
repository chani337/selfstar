from fastapi import APIRouter

router = APIRouter()

try:
    from .auth import router as auth_router
    router.include_router(auth_router)
except Exception:
    pass

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

try:
    from .instagram_webhook import router as ig_webhook_router
    router.include_router(ig_webhook_router)
except Exception:
    pass

try:
    from .files import router as files_router
    router.include_router(files_router)
except Exception:
    pass

try:
    from .instagram_publish import router as ig_publish_router
    router.include_router(ig_publish_router)
except Exception:
    pass

try:
    from .instagram_caption import router as ig_caption_router
    router.include_router(ig_caption_router)
except Exception:
    pass

try:
    from .instagram_comments import router as ig_comments_router
    router.include_router(ig_comments_router)
except Exception:
    pass

try:
    from .instagram_insights import router as ig_insights_router
    router.include_router(ig_insights_router)
except Exception:
    pass

try:
    from .instagram_notifications import router as ig_notif_router
    router.include_router(ig_notif_router)
except Exception:
    pass

try:
    from .instagram_reply import router as ig_reply_router
    router.include_router(ig_reply_router)
except Exception:
    pass

try:
    from .chat import router as chat_router
    router.include_router(chat_router)
except Exception:
    pass

# Credits routes (balance/ledger/grant)
try:
    from .credits import router as credits_router
    router.include_router(credits_router)
except Exception:
    pass
