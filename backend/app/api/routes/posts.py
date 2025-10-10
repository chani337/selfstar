from fastapi import APIRouter

router = APIRouter()

# 임시 테스트용 라우트
@router.get("/")
async def get_posts():
    return {"message": "posts route is working"}
