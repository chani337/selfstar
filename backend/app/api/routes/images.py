# backend/app/routes/images.py
from fastapi import APIRouter, HTTPException, Request
import os
import httpx
import logging
import base64
import re
import uuid
from datetime import datetime

from app.api.schemas.images import GenerateImageRequest, ImageSaveRequest

router = APIRouter(prefix="/images", tags=["images"])
log = logging.getLogger("images")

def _save_data_uri(data_uri: str):
    m = re.match(r"^data:(.*?);base64,(.*)$", data_uri)
    if not m:
        raise ValueError("invalid_data_uri")
    mime, b64 = m.groups()
    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }.get(mime, ".bin")
    raw = base64.b64decode(b64)

    # 저장 위치: MEDIA_ROOT (기본 backend/app/media)
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    media_root = os.getenv("MEDIA_ROOT") or os.path.join(app_dir, "media")
    os.makedirs(media_root, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"gen_{ts}_{uuid.uuid4().hex[:8]}{ext}"
    out_path = os.path.join(media_root, fname)
    with open(out_path, "wb") as f:
        f.write(raw)
    # 정적 서빙 경로에 맞춘 URL 생성
    rel_url = f"/media/{fname}"
    return out_path, rel_url




@router.post("/images/preview", summary="AI 미리보기(저장 없음)")
async def preview_image(payload: GenerateImageRequest):
    ai_url = (os.getenv("AI_SERVICE_URL") or "http://localhost:8600").rstrip("/")
    body = payload.model_dump(exclude_none=True)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{ai_url}/predict", json=body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ai_delegate_error: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="ai_failed")
    data = r.json()
    image = data.get("image")
    if not (isinstance(image, str) and image.startswith("data:")):
        raise HTTPException(status_code=502, detail="invalid_ai_response")
    return {"ok": True, "image": image}


@router.post("/images/save", summary="미리보기 데이터 저장")
async def save_image(body: ImageSaveRequest):
    try:
        _, url = _save_data_uri(body.image)
        log.info("saved preview to %s", url)
        return {"ok": True, "url": url}
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_data_uri")
    except Exception as e:
        log.warning("failed to save media: %s", e)
        raise HTTPException(status_code=500, detail="save_failed")
