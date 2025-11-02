from typing import List, Optional, Dict, Any
import os
import base64
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv

# 환경변수 GOOGLE_API_KEY 필요
# 모델: gemini-2.5-flash-image (이미지 생성)
MODEL_NAME = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

_client = None
log = logging.getLogger("gemini")

# 서비스별 분리: ai/.env를 우선 로드, 없으면 루트 .env 폴백
_THIS_DIR = os.path.dirname(__file__)
_AI_DIR = os.path.abspath(os.path.join(_THIS_DIR, ".."))
_REPO_ROOT = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))
_AI_ENV = os.path.join(_AI_DIR, ".env")
_ROOT_ENV = os.path.join(_REPO_ROOT, ".env")
_loaded = False
try:
    if os.path.exists(_AI_ENV):
        load_dotenv(dotenv_path=_AI_ENV, override=True)
        log.info(f"[gemini] loaded ai/.env from {_AI_ENV}")
        _loaded = True
    elif os.path.exists(_ROOT_ENV):
        load_dotenv(dotenv_path=_ROOT_ENV, override=True)
        log.info(f"[gemini] loaded repo .env from {_ROOT_ENV}")
        _loaded = True
except Exception as _e:
    log.warning(f"[gemini] failed to load .env: {_e}")

def _get_client():
    global _client
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
    if _client is None:
        _client = genai.Client(api_key=api_key)
    return _client


# 한국어 옵션값을 간단히 영어로 매핑하면 모델 안정성이 올라감
_KO_EN = {
    "faceShape": {"계란형":"oval","둥근형":"round","각진형":"square","하트형":"heart","긴형":"oblong"},
    "skinTone": {"밝은 17~21호":"fair","중간 21~23호":"light-medium","따뜻한 23~25호":"warm medium","태닝톤":"tanned","쿨톤":"cool tone"},
    "hair": {"스트레이트":"straight","웨이브":"wavy","단발":"bob","장발":"long hair","포니테일":"ponytail","업스타일":"updo"},
    "eyes": {"크고 또렷함":"large defined","고양이상":"cat-like","강아지상":"puppy-like","아치형":"arched","처진눈매":"downturned"},
    "nose": {"오똑함":"high-bridged","버튼":"button","긴코":"long","작은코":"small","직선":"straight"},
    "lips": {"도톰":"full","얇음":"thin","하트":"heart-shaped","자연":"natural","그라데":"gradient"},
    "glasses": {"있음":"with glasses","없음":"no glasses"},
    "bodyType": {"마름":"slim","슬림":"slim","보통":"average","통통":"chubby","근육질":"muscular"},
}

def _tr(key: str, val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    return _KO_EN.get(key, {}).get(val, val)


def _build_prompt_from_fields(payload: Dict[str, Any]) -> str:
    """
    프론트/백에서 그대로 전달된 원본 필드로 프롬프트 구성.
    하위호환: feature가 있으면 Additional details로만 덧붙임.
    """
    name: str = payload.get("name") or ""
    gender: str = payload.get("gender") or "person"
    age: Optional[int] = payload.get("age")
    options: List[str] = payload.get("options") or []

    # 라벨형 필드 (그대로 사용 + 일부 영어 매핑)
    faceShape = _tr("faceShape", payload.get("faceShape"))
    skinTone  = _tr("skinTone",  payload.get("skinTone"))
    hair      = _tr("hair",      payload.get("hair"))
    eyes      = _tr("eyes",      payload.get("eyes"))
    nose      = _tr("nose",      payload.get("nose"))
    lips      = _tr("lips",      payload.get("lips"))
    bodyType  = _tr("bodyType",  payload.get("bodyType"))
    glasses   = _tr("glasses",   payload.get("glasses"))
    personalities: List[str] = payload.get("personalities") or []

    # 하위호환 자유서술
    legacy_feature: Optional[str] = payload.get("feature")

    # 공통 가이드(배경/조명 등)
    base = (
        f"Create a single photorealistic, front-facing portrait of a {gender}. "
        "Natural lighting, shallow depth of field, realistic skin texture. "
        "Plain light-gray studio background and a simple white t-shirt. "
        "Output as a high-quality PNG."
    )
    if name:
        base += f" The person is named '{name}'."

    # 디테일 라인업
    lines: List[str] = []
    if age is not None: lines.append(f"Age: {age}.")
    if faceShape:       lines.append(f"Face shape: {faceShape}.")
    if skinTone:        lines.append(f"Skin tone: {skinTone}.")
    if hair:            lines.append(f"Hair: {hair}.")
    if eyes:            lines.append(f"Eyes: {eyes}.")
    if nose:            lines.append(f"Nose: {nose}.")
    if lips:            lines.append(f"Lips: {lips}.")
    if bodyType:        lines.append(f"Body type: {bodyType}.")
    if glasses:         lines.append(f"Glasses: {glasses}.")
    if personalities:   lines.append("Personality vibes: " + ", ".join(map(str, personalities)) + ".")
    if options:         lines.append("Options: " + ", ".join(map(str, options)) + ".")

    if legacy_feature:
        lines.append(f"Additional details: {legacy_feature}")

    return (base + " " + " ".join(lines)).strip()


def generate_image_from_payload(payload: Dict[str, Any]):
    """
 권장 진입점: 프론트/백에서 받은 원본 JSON을 그대로 넣어 호출.
    예) generate_image_from_payload(req.dict())
    """
    client = _get_client()
    prompt = _build_prompt_from_fields(payload)
    log.info(f"[gemini] prompt: {prompt[:300]}{'...' if len(prompt)>300 else ''}")

    image_response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[types.Part.from_text(text=prompt)],
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.IMAGE],
            candidate_count=1,
        ),
    )

    # 응답 파싱 (기존 로직 유지)
    def sniff_mime(buf: bytes) -> str:
        if buf.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if buf.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if len(buf) >= 12 and buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
            return "image/webp"
        return "application/octet-stream"

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
                    try:
                        out = bytes(raw)
                    except Exception:
                        raise RuntimeError(f"unexpected inline_data.data type: {type(raw)}")
                mime = getattr(inline, "mime_type", None) or sniff_mime(out)
                log.info(f"[gemini] decoded image bytes: {len(out)} bytes, mime: {mime}")
                return out, mime

            if hasattr(part, "data") and part.data:
                raw = part.data
                if isinstance(raw, (bytes, bytearray)):
                    out = bytes(raw)
                elif isinstance(raw, str):
                    out = base64.b64decode(raw)
                else:
                    out = bytes(raw)
                mime = sniff_mime(out)
                log.info(f"[gemini] decoded image bytes: {len(out)} bytes (part.data), mime: {mime}")
                return out, mime

    raise RuntimeError("응답에서 이미지 데이터를 찾지 못했습니다.")


