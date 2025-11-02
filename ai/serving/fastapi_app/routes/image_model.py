"""
[파트 개요] AI 서빙 라우터 (Gemini 고정)
- 이 모듈은 FastAPI Router만 제공하며, 최상위 ai/main.py에서 앱에 포함됩니다.
"""
from fastapi import APIRouter, HTTPException
from typing import Any
import base64
from io import BytesIO
import logging
import traceback
import os
from dotenv import load_dotenv
import sys
from google import genai
from google.genai import types

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None  # type: ignore

router = APIRouter()
log = logging.getLogger("ai-serving")
logging.basicConfig(level=logging.INFO)

# 리포지토리 루트의 .env 로드(이 파일 기준 ../../../../..)
_APP_DIR = os.path.dirname(__file__)
_REPO_ROOT = os.path.abspath(os.path.join(_APP_DIR, "..", "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
_ENV_PATH = os.path.join(_REPO_ROOT, ".env")
try:
    load_dotenv(dotenv_path=_ENV_PATH, override=True)
    log.info(f"[ai] Loaded repo .env from {_ENV_PATH}")
except Exception as _e:
    log.warning(f".env load failed: {_e}")


@router.get("/health")
def health():
    return {"status": "ok", "service": "ai-serving"}


from ai.serving.fastapi_app.schemas.predict import PredictRequest


# 기본적으로 모델 필요(폴백 비활성화 유지)
os.environ.setdefault("AI_REQUIRE_MODEL", "1")

# Gemini 클라이언트
_gemini_client = None


def _get_client():
    global _gemini_client
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


# 모델명(고정 기본값)
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")


def _build_prompt_from_fields(payload: dict) -> str:
    """프론트에서 온 필드들을 최소 가공 텍스트로 결합

    요구사항: 이미지 생성 시 '이름'과 '성격(personalities)'은 프롬프트에 포함하지 않는다.
    """
    name = payload.get("name")
    gender = payload.get("gender")
    age = payload.get("age")
    options = payload.get("options") or []

    faceShape = payload.get("faceShape")
    skinTone = payload.get("skinTone")
    hair = payload.get("hair")
    eyes = payload.get("eyes")
    nose = payload.get("nose")
    lips = payload.get("lips")
    bodyType = payload.get("bodyType")
    glasses = payload.get("glasses")
    personalities = payload.get("personalities") or []

    legacy_feature = payload.get("feature") or payload.get("featureCombined")

    base = (
        f"Create a single photorealistic, front-facing portrait. "
        f"Subject: {gender or 'person'}. "
        "Natural lighting, realistic skin. Plain light-gray studio background. Output PNG."
    )

    parts = []
    if age is not None:
        parts.append(f"Age: {age}.")
    if faceShape:
        parts.append(f"Face shape: {faceShape}.")
    if skinTone:
        parts.append(f"Skin tone: {skinTone}.")
    if hair:
        parts.append(f"Hair: {hair}.")
    if eyes:
        parts.append(f"Eyes: {eyes}.")
    if nose:
        parts.append(f"Nose: {nose}.")
    if lips:
        parts.append(f"Lips: {lips}.")
    if bodyType:
        parts.append(f"Body type: {bodyType}.")
    if glasses:
        parts.append(f"Glasses: {glasses}.")
    # NOTE: personalities(성격)는 이미지 생성 프롬프트에서 제외
    if options:
        parts.append("Options: " + ", ".join(map(str, options)) + ".")
    if legacy_feature:
        parts.append(f"Additional details: {legacy_feature}")

    return (base + " " + " ".join(parts)).strip()


@router.post("/predict")
async def predict(req: PredictRequest):
    try:
        require_model = (
            os.getenv("AI_REQUIRE_MODEL", "1").strip().lower() in ("1", "true", "yes")
        )
        log.info(
            "/predict called: name=%s, gender=%s, require_model=%s",
            req.name,
            req.gender,
            require_model,
        )

        # Gemini 직접 호출
        result: Any = None
        try:
            payload = req.dict(exclude_none=True)
            prompt = _build_prompt_from_fields(payload)
            client = _get_client()
            image_response = client.models.generate_content(
                model=GEMINI_IMAGE_MODEL,
                contents=[types.Part.from_text(text=prompt)],
                config=types.GenerateContentConfig(
                    response_modalities=[types.Modality.IMAGE],
                    candidate_count=1,
                ),
            )

            # 이미지 추출
            for cand in getattr(image_response, "candidates", []) or []:
                parts = getattr(cand.content, "parts", []) or []
                for part in parts:
                    inline = getattr(part, "inline_data", None)
                    if inline and getattr(inline, "data", None) is not None:
                        raw = inline.data
                        if isinstance(raw, (bytes, bytearray)):
                            out = bytes(raw)
                        elif isinstance(raw, str):
                            out = base64.b64decode(raw)
                        else:
                            out = bytes(raw)
                        mime = getattr(inline, "mime_type", None) or "image/png"
                        result = (out, mime)
                        break
                    if hasattr(part, "data") and part.data:
                        raw = part.data
                        if isinstance(raw, (bytes, bytearray)):
                            out = bytes(raw)
                        elif isinstance(raw, str):
                            out = base64.b64decode(raw)
                        else:
                            out = bytes(raw)
                        # 간단한 mime 추정
                        mime = "image/png"
                        result = (out, mime)
                        break
                if result is not None:
                    break

            if result is None:
                raise RuntimeError("응답에서 이미지 데이터를 찾지 못했습니다.")
        except Exception as e:
            log.error("Gemini model error: %s", e)
            if require_model:
                raise HTTPException(status_code=503, detail=f"model_failed: {e}")

        # ---- 출력 인코딩 ----
        if Image is not None and isinstance(result, Image.Image):
            buf = BytesIO()
            result.save(buf, format="PNG")
            data = base64.b64encode(buf.getvalue()).decode("ascii")
            return {"ok": True, "image": f"data:image/png;base64,{data}"}

        elif isinstance(result, tuple) and len(result) == 2 and isinstance(result[0], (bytes, bytearray)):
            buf, mime = result
            mime = mime or "image/png"
            data = base64.b64encode(buf).decode("ascii")
            return {"ok": True, "image": f"data:{mime};base64,{data}"}

        elif isinstance(result, (bytes, bytearray)):
            data = base64.b64encode(result).decode("ascii")
            return {"ok": True, "image": f"data:image/png;base64,{data}"}

        # ---- 폴백 (모델 불필요 모드에서만) ----
        if not require_model and Image is not None:
            try:
                img = Image.new("RGB", (768, 1024), color=(240, 242, 245))
                draw = ImageDraw.Draw(img)
                # 이름은 제외, 성별만 간단 표기
                g = req.gender or "person"
                text = f"{g}\nPlaceholder portrait"
                draw.text((24, 24), text, fill=(30, 30, 30))
                buf = BytesIO()
                img.save(buf, format="PNG")
                data = base64.b64encode(buf.getvalue()).decode("ascii")
                return {"ok": True, "image": f"data:image/png;base64,{data}"}
            except Exception as fe:
                log.warning("Fallback image failed: %s", fe)

        raise HTTPException(status_code=503, detail="unsupported_model_output")

    except HTTPException:
        raise
    except Exception as e:
        log.error("/predict failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"predict_failed: {e}")
