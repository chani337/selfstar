from fastapi import APIRouter, HTTPException
import os
import logging
import traceback
import base64
from typing import Optional, Dict, Tuple, Any
import httpx
from google import genai
from google.genai import types
from ai.serving.fastapi_app.schemas.chat import ChatRequest, ChatResponse
from pydantic import BaseModel, Field
try:
    from PIL import Image, ImageDraw
except Exception:
    Image = None  # type: ignore

router = APIRouter()
log = logging.getLogger("ai-chat")

_client = None
_jobs: Dict[str, Dict] = {}

# ===== Session memory (LangChain) =====
try:
    from langchain.memory import ConversationBufferMemory  # type: ignore
    from langchain.schema import HumanMessage, AIMessage  # type: ignore
    _LC_AVAILABLE = True
except Exception:
    ConversationBufferMemory = None  # type: ignore
    HumanMessage = AIMessage = None  # type: ignore
    _LC_AVAILABLE = False

_SESSION_MEMORY: Dict[str, Any] = {}

def _get_memory(session_id: Optional[str]) -> Optional[Any]:
    if not _LC_AVAILABLE or not session_id:
        return None
    mem = _SESSION_MEMORY.get(session_id)
    if mem is None:
        mem = ConversationBufferMemory(return_messages=True, memory_key="history")
        _SESSION_MEMORY[session_id] = mem
    return mem

# Optional LangSmith tracing
LS_ENABLED = False
LS_PROJECT = os.getenv("LANGSMITH_PROJECT") or os.getenv("LANGCHAIN_PROJECT") or "Selfstar.AI"
try:
    _ls_flag = (os.getenv("LANGSMITH_TRACING") or os.getenv("LANGCHAIN_TRACING_V2") or "false").strip().lower()
    LS_ENABLED = _ls_flag in ("1", "true", "yes")
    if LS_ENABLED:
        from langsmith import Client as LSClient  # type: ignore
        from langsmith.run_trees import RunTree  # type: ignore
    else:
        LSClient = None  # type: ignore
        RunTree = None  # type: ignore
except Exception:
    LS_ENABLED = False
    LSClient = None  # type: ignore
    RunTree = None  # type: ignore

def _start_run(name: str, inputs: dict, ls_session_id: Optional[str] = None):
    if not LS_ENABLED or RunTree is None:
        return None
    try:
        client = LSClient()
        tags = []
        metadata = {"app": "selfstar-ai"}
        if ls_session_id:
            tags.append(f"session:{ls_session_id}")
            metadata["ls_session_id"] = ls_session_id
        rt = RunTree(name=name, run_type="chain", inputs=inputs, project_name=LS_PROJECT, tags=tags, metadata=metadata)
        return (rt, client)
    except Exception:
        return None


@router.post("/chat/trace/heartbeat")
async def chat_trace_heartbeat(body: dict | None = None):
    """Create a tiny LangSmith run immediately, so the project appears right away.
    Safe no-op when tracing is disabled or langsmith is not installed.
    """
    try:
        ls_session_id = None
        if isinstance(body, dict):
            ls_session_id = body.get("ls_session_id")
        rt_client = _start_run(
            name="session_heartbeat",
            inputs={"msg": "chat session opened"},
            ls_session_id=ls_session_id,
        )
        if not rt_client:
            return {
                "ok": False,
                "ls": "disabled",
                "ls_enabled": bool(LS_ENABLED),
                "have_api_key": bool(os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")),
                "project": LS_PROJECT,
            }
        rt, lsc = rt_client
        rt.end(outputs={"ok": True})
        try:
            rt.post(lsc)
            posted = True
        except Exception as e:
            # Even if posting fails, don't break the app
            posted = False
            err = str(e)
            return {
                "ok": False,
                "posted": posted,
                "error": err,
                "ls_enabled": bool(LS_ENABLED),
                "have_api_key": bool(os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")),
                "project": LS_PROJECT,
            }
        return {
            "ok": True,
            "posted": True,
            "ls_enabled": bool(LS_ENABLED),
            "have_api_key": bool(os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")),
            "project": LS_PROJECT,
        }
    except Exception:
        return {"ok": False, "ls_enabled": bool(LS_ENABLED)}


@router.post("/chat/session/clear")
async def chat_session_clear(body: dict | None = None):
    """Clear in-memory conversation state for a given session id."""
    try:
        sid = None
        if isinstance(body, dict):
            sid = body.get("ls_session_id") or body.get("session_id")
        if sid and sid in _SESSION_MEMORY:
            try:
                del _SESSION_MEMORY[sid]
            except Exception:
                _SESSION_MEMORY.pop(sid, None)
        return {"ok": True, "cleared": bool(sid)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _get_client():
    global _client
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
    if _client is None:
        _client = genai.Client(api_key=api_key)
    return _client


GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

def _canonicalize_models(text_model: str, image_model: str):
    t = (text_model or "").strip()
    i = (image_model or "").strip()
    # Common legacy -> current mappings
    if t == "gemini-1.5-flash":
        t = "gemini-1.5-flash-002"  # avoid NOT_FOUND on v1beta
    if t == "gemini-1.5-pro":
        t = "gemini-2.5-flash"  # prefer newer available text-capable model
    # Map legacy names to the current preferred image model
    if i == "imagen-3.0-generate-001":
        i = "gemini-2.5-flash-image"
    return t, i

GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL = _canonicalize_models(GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        if not req.messages:
            raise HTTPException(status_code=400, detail="messages_required")
        require_model = (
            os.getenv("AI_REQUIRE_MODEL", "1").strip().lower() in ("1", "true", "yes")
        )
        # Try to get client
        try:
            client = _get_client()
        except Exception as e:
            if require_model:
                raise
            # Fallback text when model disabled
            return ChatResponse(ok=True, reply="(fallback) 현재 모델이 준비되지 않았어요. 테스트 모드에서 응답합니다.")

        system_prompt = (
            "You are a social media assistant helping an influencer craft concise, friendly responses. "
            "Keep replies within 2-3 sentences unless asked for more."
        )
        parts = [types.Part.from_text(text=system_prompt)]
        if req.persona_img:
            snippet = req.persona_img
            if snippet.startswith("data:"):
                snippet = snippet[:72] + "..."
            parts.append(types.Part.from_text(text=f"Persona image: {snippet}"))

        last_user = None
        for m in reversed(req.messages):
            if m.role == "user":
                last_user = m.content
                break
        if last_user is None:
            last_user = req.messages[-1].content

        parts.append(types.Part.from_text(text=f"User: {last_user}"))

        try:
            resp = client.models.generate_content(
                model=GEMINI_TEXT_MODEL,
                contents=parts,
                config=types.GenerateContentConfig(
                    response_modalities=[types.Modality.TEXT], candidate_count=1
                ),
            )
            reply = ""
            for c in getattr(resp, "candidates", []) or []:
                for p in getattr(c.content, "parts", []) or []:
                    if getattr(p, "text", None):
                        reply += p.text
        except Exception as e:
            # If dev mode (model not strictly required), fall back to a canned reply
            require_model = (
                os.getenv("AI_REQUIRE_MODEL", "1").strip().lower() in ("1", "true", "yes")
            )
            if require_model:
                raise
            log.warning("/chat text generation failed, falling back: %s", e)
            reply = "(fallback) 현재 모델이 준비되지 않았어요. 테스트 모드에서 응답합니다."
        reply = (reply or "").strip() or "지금은 답변을 만들 수 없었어요. 잠시 후 다시 시도해주세요."
        return ChatResponse(ok=True, reply=reply)
    except HTTPException:
        raise
    except Exception as e:
        log.error("/chat failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail={"error": "chat_failed", "message": str(e)})


# ======= Notebook-style create_img_original flow =======

class ChatImageRequest(BaseModel):
    user_text: str = Field(..., min_length=1)
    persona_img: Optional[str] = None  # URL or data URI
    persona: Optional[str] = None      # persona data stringified if any
    ls_session_id: Optional[str] = None
    style_img: Optional[str] = None    # Optional: outfit/style reference image


class ChatImageResponse(BaseModel):
    ok: bool = True
    prompt: str
    image: str  # data URI


def _placeholder_image_data_uri(text: str) -> str:
    """Generate a simple placeholder PNG as data URI.
    Tries PIL first; if unavailable, returns a tiny 1x1 PNG.
    """
    try:
        if Image is not None:
            img = Image.new("RGB", (768, 960), color=(242, 244, 247))
            drw = ImageDraw.Draw(img)
            msg = f"Fallback image\n{text[:120]}"
            drw.text((24, 24), msg, fill=(32, 32, 36))
            import io
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            import base64 as _b64
            return f"data:image/png;base64,{_b64.b64encode(buf.getvalue()).decode('ascii')}"
    except Exception:
        pass
    # 1x1 transparent PNG
    tiny_png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
    )
    return f"data:image/png;base64,{tiny_png_b64}"


def _build_meta_prompt(persona: str, user_text: str, has_style_img: bool) -> str:
    # Exact meta-prompt copied from the notebook `create_img_original`
    return  f"""
Keep left-right orientation exactly as in the reference (no mirroring).
You are an expert prompt engineer for photorealistic image generation.
Your task is to create a detailed, natural English prompt for the Nanobanana image model.
Use the following photo as the identity reference
Use the information below:
- Persona data from the database: "{persona}"
- User request: "{user_text}"

Follow these strict rules:

1. Identity Preservation:
   - The provided reference image and persona data define the subject’s **exact face, hairstyle, and body shape**.
   - Do NOT alter or reinterpret the face, eyes, skin tone, hairstyle, or body type,
     even if the user request suggests such changes.
   - Ignore any text that implies modifying facial or physical traits.

2. Context and Action:
   - Interpret the user request carefully to describe the **environment, location, and main action** clearly.
   - Incorporate only contextual or behavioral changes (e.g., background, pose, action),
     not appearance changes.
   - Ensure the description sounds natural and coherent.

3. Realism and Style:
   - The final image must look **ultra-realistic**, as if taken with a real camera.
   - Use natural lighting, realistic proportions, and lifelike skin texture.
   - Avoid cartoon, illustration, painterly, or artificial styles.

4. Perspective and Composition:
   - If the request includes “selfie”, “셀카”, or “셀피” → use a **first-person camera angle**
     where the subject’s arm or hand naturally holds a phone.
   - If the request includes “사진을 찍는 모습” → use a **third-person camera angle**
     showing the subject being photographed.
   - Maintain realistic anatomy, perspective, and camera framing.

5. Negative Prompts:
   - no cartoon, no illustration, no AI artifacts, no surreal distortion,
     no unrealistic retouching, no duplicated faces, no unnatural anatomy,
     no text, no watermark, no gender or hairstyle change.

Output:
Generate one single, ready-to-use, English prompt describing a high-resolution, photorealistic PNG image
that perfectly depicts "{user_text}" while keeping the person’s face, hairstyle, and body identical
to the original reference and persona data.
Only output the final image generation prompt — no explanations.
""".strip()


def _with_outfit_lock_prompt(base_prompt: str, has_style_img: bool) -> str:
    """Do not modify the meta prompt; instead, append a concise outfit-lock contract
    only for the final image-generation prompt when a style image is provided.
    """
    if not has_style_img:
        return base_prompt.strip()
    lock = (
        "\n\nIMPORTANT — Outfit Lock (style image provided):\n"
        "- Use the additional image ONLY as a clothing reference; DO NOT copy face/body/background.\n"
        "- Exactly reproduce the SAME OUTFIT: category, structure, silhouette, color, pattern, fabric/texture, length, neckline/collar, sleeves, slits/closures, trims.\n"
        "- Do NOT change outfit category or layers (no dress↔top+pants, no skirt↔pants, no add/remove jackets/cardigans).\n"
        "- Do NOT change color/material/pattern. If any conflict with the prompt exists, the OUTFIT RULES TAKE PRIORITY.\n"
        "- Strict negatives: no outfit change, no wardrobe swap, no different garments, no adding/removing layers, no color/material alteration.\n"
        "- REPEAT: Keep the exact same outfit as the style reference. Keep the exact same outfit. Keep the exact same outfit.\n"
    )
    return (base_prompt.strip() + lock)


async def _fetch_image_bytes(uri_or_url: str) -> Tuple[bytes, str]:
    # data URI (PNG/JPEG 등 모두 허용)
    if uri_or_url.startswith("data:"):
        try:
            head, b64 = uri_or_url.split(",", 1)
            mime = "image/png"
            try:
                prefix = head.split(";")[0]
                if prefix.startswith("data:"):
                    mime = prefix[len("data:"):]
            except Exception:
                pass
            return base64.b64decode(b64), mime
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"invalid_data_uri: {e}")
    # http(s) URL
    if uri_or_url.startswith("http://") or uri_or_url.startswith("https://"):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(uri_or_url)
                r.raise_for_status()
                mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
                return r.content, mime
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"failed_to_fetch_image: {e}")
    raise HTTPException(status_code=400, detail="persona_img must be a data URI or http(s) URL")


@router.post("/chat/image", response_model=ChatImageResponse)
async def chat_image(req: ChatImageRequest):
    try:
        require_model = (
            os.getenv("AI_REQUIRE_MODEL", "1").strip().lower() in ("1", "true", "yes")
        )
        # Start LangSmith run (session-tagged) if enabled
        rt_client = _start_run(
            name="chat_image",
            inputs={"user_text": req.user_text, "has_persona_img": bool(req.persona_img)},
            ls_session_id=req.ls_session_id,
        )
        if rt_client:
            rt, lsc = rt_client
        else:
            rt = lsc = None
        # Attempt client; may fail if key missing
        try:
            client = _get_client()
        except Exception as e:
            client = None

        persona_text = req.persona or ""
        # ===== Pull session memory and include as context =====
        mem = _get_memory(req.ls_session_id)
        history_text = ""
        if mem is not None:
            try:
                msgs = getattr(mem, "chat_memory").messages or []
                # Keep last 8 exchanges
                tail = msgs[-16:]
                formatted = []
                for m in tail:
                    if hasattr(m, 'content'):
                        role = 'User' if m.__class__.__name__.startswith('Human') else 'Assistant'
                        txt = str(getattr(m, 'content', '') or '')
                        if txt:
                            formatted.append(f"{role}: {txt}")
                if formatted:
                    history_text = "\n".join(formatted)
            except Exception:
                history_text = ""
        # Build the notebook meta-prompt and improve it with a text model (2-step flow)
        extra_context = ("\n\nPrevious session conversation (use to maintain continuity, style preferences and constraints):\n" + history_text) if history_text else ""
        meta_prompt = _build_meta_prompt(persona_text, req.user_text, bool(req.style_img)) + extra_context

        generated_prompt = ""
        if client is not None:
            try:
                llm_resp = client.models.generate_content(
                    model=GEMINI_TEXT_MODEL,
                    contents=[types.Part.from_text(text=meta_prompt)],
                    config=types.GenerateContentConfig(
                        response_modalities=[types.Modality.TEXT], candidate_count=1
                    ),
                )
                for c in getattr(llm_resp, "candidates", []) or []:
                    for p in getattr(c.content, "parts", []) or []:
                        if getattr(p, "text", None):
                            generated_prompt += p.text
                generated_prompt = (generated_prompt or "").strip()
                if not generated_prompt:
                    raise RuntimeError("llm_returned_empty_prompt")
                if rt:
                    rt.create_child(name="meta_prompt", run_type="llm", inputs={"meta": meta_prompt}).end(outputs={"final_prompt": generated_prompt})
            except Exception as e:
                if require_model:
                    raise HTTPException(status_code=500, detail=f"llm_generate_failed: {e}")
                log.warning("/chat/image prompt generation failed, fallback used: %s", e)
                generated_prompt = (
                    f"Create a single photorealistic portrait PNG. Natural lighting, realistic skin, high detail. Subject: {req.user_text.strip()}"
                )
        else:
            # No client available
            if require_model:
                raise HTTPException(status_code=503, detail="model_unavailable")
            generated_prompt = (
                f"Create a single photorealistic portrait PNG. Natural lighting, realistic skin, high detail. Subject: {req.user_text.strip()}"
            )

        # 2) Persona image is required by the flow; fetch bytes and mime
        if not req.persona_img:
            raise HTTPException(status_code=400, detail="persona_img_required")
        try:
            persona_bytes, persona_mime = await _fetch_image_bytes(req.persona_img)
        except HTTPException:
            raise
        except Exception as e:
            if require_model:
                raise HTTPException(status_code=400, detail=f"persona_image_fetch_failed: {e}")
            log.warning("persona image fetch failed, using placeholder: %s", e)
            persona_bytes, persona_mime = b"", "image/jpeg"

        # Optional style/outfit reference image
        style_bytes: Optional[bytes] = None
        style_mime: str = "image/jpeg"
        if req.style_img:
            try:
                style_bytes, style_mime = await _fetch_image_bytes(req.style_img)
            except Exception as e:
                log.warning("style image fetch failed, skipping: %s", e)
                style_bytes = None

        if client is not None:
            # 3) Call image model with TEXT + IMAGE (inline_data) as in the notebook
            try:
                final_prompt = _with_outfit_lock_prompt(generated_prompt, bool(req.style_img))
                # Order matters slightly in some models: place style before persona to bias outfit, while persona still preserves identity.
                contents = [types.Part.from_text(text=final_prompt)]
                if style_bytes:
                    contents.append(types.Part.from_bytes(data=style_bytes, mime_type=style_mime))
                contents.append(types.Part.from_bytes(data=persona_bytes, mime_type=persona_mime))
                img_resp = client.models.generate_content(
                    model=GEMINI_IMAGE_MODEL,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=[types.Modality.IMAGE],
                        candidate_count=1,
                        temperature=0.08,
                        top_p=0.3,
                        max_output_tokens=2048,
                    ),
                )
                if rt:
                    rt.create_child(name="image_generate", run_type="llm", inputs={"prompt": final_prompt, "had_style_img": bool(req.style_img)}).end(outputs={"status": "requested"})
            except Exception as e:
                if require_model:
                    raise HTTPException(status_code=500, detail=f"image_generate_failed: {e}")
                log.warning("/chat/image image generation failed, fallback used: %s", e)
                img_resp = None

            # 4) Extract image
            out_bytes: Optional[bytes] = None
            out_mime = "image/png"
            for cand in getattr(img_resp, "candidates", []) or []:
                for part in getattr(cand.content, "parts", []) or []:
                    inline = getattr(part, "inline_data", None)
                    if inline and getattr(inline, "data", None) is not None:
                        raw = inline.data
                        if isinstance(raw, (bytes, bytearray)):
                            out_bytes = bytes(raw)
                        elif isinstance(raw, str):
                            out_bytes = base64.b64decode(raw)
                        else:
                            try:
                                out_bytes = bytes(raw)
                            except Exception:
                                pass
                        if getattr(inline, "mime_type", None):
                            out_mime = inline.mime_type
                        break
                    # Fallback: some SDK variants put image bytes in part.data
                    if hasattr(part, "data") and part.data:
                        raw = part.data
                        if isinstance(raw, (bytes, bytearray)):
                            out_bytes = bytes(raw)
                        elif isinstance(raw, str):
                            out_bytes = base64.b64decode(raw)
                        else:
                            out_bytes = bytes(raw)
                        # mime best-effort
                        out_mime = "image/png"
                        break
                if out_bytes:
                    break

            if not out_bytes:
                if require_model:
                    raise HTTPException(status_code=502, detail="image_not_returned")
                # Fallback to placeholder
                data_uri = _placeholder_image_data_uri(req.user_text)
                if rt:
                    rt.end(outputs={"ok": True, "fallback": True})
                    rt.post(lsc)
                return ChatImageResponse(ok=True, prompt=generated_prompt, image=data_uri)
            else:
                # Normal successful generation path
                data_uri = f"data:{out_mime};base64,{base64.b64encode(out_bytes).decode('ascii')}"
                if rt:
                    rt.end(outputs={"ok": True, "image_mime": out_mime, "image_len": len(out_bytes)})
                    rt.post(lsc)
                # Update session memory with this turn
                if mem is not None:
                    try:
                        mem.chat_memory.add_user_message(req.user_text)
                        # store brief info instead of full data-uri
                        mem.chat_memory.add_ai_message("[image_generated]")
                    except Exception:
                        pass
                return ChatImageResponse(ok=True, prompt=generated_prompt, image=data_uri)
        else:
            # Fallback placeholder image
            if require_model:
                raise HTTPException(status_code=503, detail="model_unavailable")
            data_uri = _placeholder_image_data_uri(req.user_text)
            if rt:
                rt.end(outputs={"ok": True, "fallback": True})
                rt.post(lsc)
            return ChatImageResponse(ok=True, prompt=generated_prompt, image=data_uri)
    except HTTPException:
        # Pass-through but try to mark error in run
        try:
            if rt:
                rt.end(error=True)
                rt.post(lsc)
        except Exception:
            pass
        raise
    except Exception as e:
        log.error("/chat/image failed: %s\n%s", e, traceback.format_exc())
        try:
            if rt:
                rt.end(error=True, outputs={"exception": str(e)})
                rt.post(lsc)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail={"error": "chat_image_failed", "message": str(e)})


@router.get("/chat/health")
async def chat_health():
    # Simple ping to confirm AI chat router is alive
    return {"ok": True, "text_model": GEMINI_TEXT_MODEL, "image_model": GEMINI_IMAGE_MODEL}