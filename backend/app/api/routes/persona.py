from fastapi import APIRouter, HTTPException, status, Request
from ..schemas.persona import PersonaUpsert, PersonaUpdate
from app.api.models.persona import create_persona, get_user_personas, update_persona_fields, delete_persona
import logging
from app.core.s3 import s3_enabled, presign_get_url
import os

log = logging.getLogger("personas")


router = APIRouter(prefix="/api/personas", tags=["personas"])

@router.get("/me", status_code=status.HTTP_200_OK)
async def list_my_personas(request: Request):
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")

    try:
        rows = await get_user_personas(int(user_id))
        items = []
        for r in rows:
            params = r.get("persona_parameters") or {}
            # UI 표시용 이름: parameters.name 이 있으면 사용, 없으면 "프로필 {num}"
            disp = params.get("name") or f"프로필 {r.get('user_persona_num')}"
            raw_img = (r.get("persona_img") or "").strip()
            img_out = raw_img
            # 값이 S3 키처럼 보이면(http/https, /media/가 아닌 경우) 즉시 프리사인 URL로 변환
            if raw_img and not raw_img.lower().startswith("http") and not raw_img.startswith("/media/"):
                if s3_enabled():
                    try:
                        img_out = presign_get_url(raw_img)
                    except Exception:
                        # 실패 시 원본 키 그대로 반환
                        img_out = raw_img
            # 과거 로컬 절대 URL(http://localhost, http://127.0.0.1) 보정
            elif raw_img.lower().startswith("http://localhost") or raw_img.lower().startswith("http://127.0.0.1"):
                try:
                    from urllib.parse import urlparse
                    p = urlparse(raw_img)
                    path = p.path or ""
                    if path.startswith("/personas/") or path.startswith("/uploads/"):
                        # personas/uploads 경로는 S3 키로 간주하여 프리사인
                        if s3_enabled():
                            img_out = presign_get_url(path.lstrip("/"))
                        else:
                            backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                            img_out = f"{backend_url}{path}"
                    elif path.startswith("/media/"):
                        backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                        img_out = f"{backend_url}{path}"
                    else:
                        backend_url = (os.getenv("BACKEND_URL") or "http://localhost:8000").rstrip("/")
                        img_out = f"{backend_url}{path or '/'}"
                except Exception:
                    img_out = raw_img
            items.append({
                "num": r.get("user_persona_num"),
                "img": img_out,
                "name": disp,
            })
        return {"ok": True, "items": items}
    except Exception as e:
        log.exception("Failed to list personas for user_id=%s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to list personas")


@router.put("/setting", status_code=status.HTTP_201_CREATED)
async def put_my_persona(payload: PersonaUpsert, request: Request):
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")

    try:
        # 디버그: 최소한의 페이로드 정보(키 목록)와 user_id 로깅
        try:
            pp_keys = list(payload.persona_parameters.keys())[:8]
        except Exception:
            pp_keys = []
        log.info("PUT /personas/setting by user_id=%s img=%s params_keys=%s", user_id, payload.persona_img, pp_keys)

        persona_id, persona_num = await create_persona(
            user_id=int(user_id),
            persona_img=payload.persona_img,
            persona_parameters=payload.persona_parameters,
        )
    except ValueError as e:
        if str(e) == "persona_limit_reached":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="persona_limit_reached")
        raise
    except Exception as e:
        log.exception("Failed to save persona for user_id=%s: %s", user_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to save persona: {e}")

    return {"ok": True, "persona_id": int(persona_id), "persona_num": int(persona_num)}


@router.patch("/{persona_num}", status_code=status.HTTP_200_OK)
async def patch_my_persona(persona_num: int, payload: PersonaUpdate, request: Request):
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")
    try:
        await update_persona_fields(
            int(user_id),
            int(persona_num),
            name=payload.name,
            persona_img=payload.persona_img,
            persona_parameters_patch=payload.persona_parameters or None,
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Failed to update persona user_id=%s num=%s: %s", user_id, persona_num, e)
        raise HTTPException(status_code=500, detail="update_failed")


@router.delete("/{persona_num}", status_code=status.HTTP_200_OK)
async def remove_my_persona(persona_num: int, request: Request):
    user_id = request.session.get("user_id") if hasattr(request, "session") else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")
    try:
        await delete_persona(int(user_id), int(persona_num))
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Failed to delete persona user_id=%s num=%s: %s", user_id, persona_num, e)
        raise HTTPException(status_code=500, detail="delete_failed")


