from __future__ import annotations
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, AnyHttpUrl
import httpx

# 내부 OAuth/연동 유틸 재사용
from .oauth_instagram import (
    GRAPH as IG_GRAPH,
    _require_login,               # 세션에서 user_id 확인
    _get_persona_token,           # 페르소나별 long-lived user token 조회
    _get_persona_instagram_mapping,  # ss_persona에 저장된 IG 매핑(ig_user_id/fb_page_id)
)


# 파트: Instagram 게시 API
router = APIRouter(prefix="/api/instagram", tags=["instagram"])


class InstagramPublishRequest(BaseModel):
    # payload
    # - persona_num: 페르소나 번호(연동/매핑 기준)
    # - image_url: 공개 접근 가능한 절대 URL(HTTPS 권장)
    # - caption: 게시 캡션
    persona_num: int
    image_url: AnyHttpUrl
    caption: Optional[str] = None


@router.post("/publish")
async def publish_instagram(request: Request, body: InstagramPublishRequest):
    """Instagram Business/Creator 계정으로 단일 이미지 게시

    전제 조건
    - 페르소나 OAuth 완료 → long-lived user token 보유
    - ss_persona 매핑(ig_user_id, fb_page_id) 존재
    - image_url: 외부에서 접근 가능한 공개 URL(데이터 URI 불가)

    절차
    1) POST {IG_GRAPH}/{ig_user_id}/media (image_url, caption, access_token)
    2) POST {IG_GRAPH}/{ig_user_id}/media_publish (creation_id, access_token)
    """
    user_id = _require_login(request)

    # 토큰 & 매핑 확인
    token = await _get_persona_token(user_id, int(body.persona_num))
    if not token:
        # 프론트에서 /oauth/instagram/start?persona_num=... 로 유도 필요
        raise HTTPException(status_code=401, detail="persona_oauth_required")

    mapping = await _get_persona_instagram_mapping(user_id, int(body.persona_num))
    if not mapping or not mapping.get("ig_user_id"):
        raise HTTPException(status_code=400, detail="persona_instagram_not_linked")

    ig_user_id = mapping["ig_user_id"]

    # 1) 컨테이너 생성
    async with httpx.AsyncClient(timeout=60) as client:
        create = await client.post(
            f"{IG_GRAPH}/{ig_user_id}/media",
            data={
                "image_url": str(body.image_url),
                "caption": body.caption or "",
                "access_token": token,
            },
        )
    if create.status_code != 200:
        raise HTTPException(status_code=create.status_code, detail=create.text)
    creation_id = (create.json() or {}).get("id")
    if not creation_id:
        raise HTTPException(status_code=502, detail="creation_id_missing")

    # 2) 발행
    async with httpx.AsyncClient(timeout=60) as client:
        pub = await client.post(
            f"{IG_GRAPH}/{ig_user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": token,
            },
        )
    if pub.status_code != 200:
        raise HTTPException(status_code=pub.status_code, detail=pub.text)
    return {"ok": True, "result": pub.json()}
