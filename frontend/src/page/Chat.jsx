import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import { Image as ImageIcon, Loader2, MessageSquare, User, ChevronsRight, ChevronLeft, ChevronRight, X, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// removed hashtags UI; badge no longer needed
import { API_BASE } from "@/api/client";

// Helpers
// deprecated: mockCaption no longer used; keep for potential future fallbacks
// const mockCaption = () => "";

const mockHashtags = (prompt) => {
  const words = (prompt || "패션쇼 블랙 드레스 런웨이 감도").split(/\s+/);
  const base = ["#fashion", "#runway", "#ootd", "#model", "#lookbook", "#style", "#instafashion", "#catwalk", "#trend", "#editorial"];
  return [
    ...new Set([
      ...base,
      ...words.filter(Boolean).slice(0, 5).map((w) => `#${w.replace(/[^가-힣a-z0-9]/gi, "")}`),
    ]),
  ].slice(0, 12);
};

const avatarFromName = (name) => `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(name || "influencer")}`;

export default function Chat() {
  const nav = useNavigate();
  // Scroll handling for chat messages
  const messagesEndRef = useRef(null);
  const [current, setCurrent] = useState(null);
  const [askProfile, setAskProfile] = useState(true);
  // Track if we've already requested the global profile selector to open
  const requestedSelectorRef = useRef(false);

  // chat messages; if image present, render image bubble
  const [messages, setMessages] = useState([
    { id: 1, role: "assistant", text: "인스타그램을 연동해야 생성된 이미지를 인스타그램에 업로드할 수 있습니다.", ts: Date.now() - 5000 },
  ]);

  // options/inputs
  // 입력창은 예시를 placeholder로만 보여주고 값은 비워둠
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Multi-image preview state with carousel controls
  const [previewImages, setPreviewImages] = useState([]); // array of data URIs/URLs
  const [previewIndex, setPreviewIndex] = useState(0);
  // 마지막 생성 이미지를 숨김 스타일 참조로 보관(프리뷰로 자동 이동하지 않음)
  const [lastStyleImage, setLastStyleImage] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPreviewHint, setShowPreviewHint] = useState(false);
  // Refs and state for fly-to-preview animation
  const imgRefs = useRef(new Map()); // messageId -> HTMLImageElement
  const previewDropRef = useRef(null);
  // Removed fly-to-preview animation; no auto-move
  const [vibe, setVibe] = useState("insta");
  const [lsSessionId, setLsSessionId] = useState(null);
  const [caption, setCaption] = useState("");
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState("");
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadState, setUploadState] = useState({ step: "idle", message: "", error: "", canConnect: false });
  // Abort controllers to prevent overlapping requests from spamming the console
  const imgReqRef = useRef(null);
  const captionReqRef = useRef(null);

  // Handwritten-like loading bubble (fixed size)
  function HandwriteLoader({ label = "이미지를 생성 중입니다…" }) {
    const textRef = useRef(null);
    const [w, setW] = useState(160);
    useEffect(() => {
      const r = textRef.current;
      if (!r) return;
      const measure = () => setW(r.offsetWidth || 160);
      measure();
      // re-measure on resize for safety
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, []);
    const D = 1.8; // seconds
    return (
      <div className="h-9 w-[260px] inline-flex items-center rounded-full bg-white/85 px-3 border shadow-sm relative overflow-hidden">
        <motion.span
          ref={textRef}
          className="text-sm text-neutral-800 italic relative z-10"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"] }}
          transition={{ duration: D, ease: "easeInOut", repeat: Infinity }}
        >
          {label}
        </motion.span>
        <motion.div
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20"
          animate={{ x: [0, Math.max(0, w - 6)] }}
          transition={{ duration: D, ease: "easeInOut", repeat: Infinity }}
        >
          <PenLine className="size-4 text-neutral-700" />
        </motion.div>
      </div>
    );
  }

  const currentPreview = previewImages.length ? previewImages[Math.min(previewIndex, previewImages.length - 1)] : null;

  // (이전 애니메이션 로딩은 제거)

  // 간단한 의도 감지: 사용자가 "다른 옷"을 요청하는지 판별
  const wantsDifferentOutfit = (text) => {
    const t = (text || "").toLowerCase();
    const ko = /(다른\s*옷|옷\s*바꿔|옷\s*변경|스타일\s*바꿔|코디\s*바꿔)/;
    const en = /(different\s*(outfit|clothes)|change\s*(outfit|clothes)|new\s*(outfit|look))/i;
    return ko.test(text || "") || en.test(t);
  };

  const addToPreview = (uri) => {
    if (!uri || typeof uri !== "string") return;
    setPreviewImages((arr) => {
      const next = [...arr, uri];
      setPreviewIndex(next.length - 1);
      return next;
    });
  };
  const removeCurrentPreview = () => {
    setPreviewImages((arr) => {
      const idx = Math.min(previewIndex, arr.length - 1);
      const next = arr.filter((_, i) => i !== idx);
      const newIdx = Math.max(0, Math.min(idx, next.length - 1));
      setPreviewIndex(newIdx);
      return next;
    });
  };

  const isHttpUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);

  // 엔드포인트: POST /files/ensure_public
  // payload: { image: dataURI|/files/상대경로|http(s)URL, persona_num? }
  // 반환: { ok, url(절대), path? }
  const ensurePublicUrl = async (img) => {
    const res = await fetch(`${API_BASE}/api/files/ensure_public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ image: img, persona_num: current?.num }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.url) throw new Error(typeof data?.detail === "string" ? data.detail : JSON.stringify(data));
    return data.url;
  };

  // 엔드포인트: POST /instagram/publish
  // payload: { persona_num, image_url(절대 URL), caption }
  const uploadToInstagram = async () => {
    // Open modal immediately
    setShowUploadModal(true);
    setUploadState({ step: "precheck", message: "업로드를 준비하고 있어요…", error: "", canConnect: false });
    if (!current?.num) {
      setUploadState({ step: "error", message: "", error: "먼저 페르소나를 선택해 주세요.", canConnect: false });
      return;
    }
    if (!currentPreview) {
      setUploadState({ step: "error", message: "", error: "프리뷰에 이미지가 없습니다.", canConnect: false });
      return;
    }
    // Ensure image is a public URL
    let uploadUrl = currentPreview;
    if (!isHttpUrl(uploadUrl)) {
      try {
        setUploadState({ step: "publishing", message: "이미지를 업로드 가능한 주소로 변환 중…", error: "", canConnect: false });
        uploadUrl = await ensurePublicUrl(uploadUrl);
      } catch (e) {
        setUploadState({ step: "error", message: "", error: `공개 URL 변환 실패: ${e}`, canConnect: false });
        return;
      }
    }
  // 사용자 입력 캡션만 사용(자동 해시태그 추가 제거)
  const cap = `${(caption || "").trim()}`.slice(0, 2200);
    try {
      setUploadState({ step: "publishing", message: "인스타그램에 게시를 요청 중…", error: "", canConnect: false });
      const res = await fetch(`${API_BASE}/api/instagram/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ persona_num: current.num, image_url: uploadUrl, caption: cap }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && (data?.detail === "persona_oauth_required")) {
        // Offer connect flow directly in modal
        setUploadState({ step: "auth", message: "인스타그램 연동이 필요합니다.", error: "", canConnect: true });
        // 가이드 메시지를 채팅에도 남김
        setMessages((m) => [
          ...m,
          { id: Date.now(), role: "assistant", text: "인스타그램을 연동해야 생성된 이미지를 인스타그램에 업로드할 수 있습니다.", ts: Date.now() },
        ]);
        return;
      }
      if (!res.ok || !data?.ok) {
        setUploadState({ step: "error", message: "", error: `업로드 실패: ${typeof data?.detail === "string" ? data.detail : JSON.stringify(data)}` , canConnect: false });
        return;
      }
      setUploadState({ step: "done", message: "업로드 요청이 접수되었습니다. 잠시 후 인스타그램에서 확인해 주세요.", error: "", canConnect: false });
    } catch (e) {
      setUploadState({ step: "error", message: "", error: `업로드 중 오류: ${e}`, canConnect: false });
    }
  };
  const autoGenerateCaption = async () => {
    if (!currentPreview) {
      alert("프리뷰에 이미지가 없습니다.");
      return;
    }
    // cancel prior caption draft request if still in-flight
    try { captionReqRef.current?.abort(); } catch {}
    const ctrl = new AbortController();
    captionReqRef.current = ctrl;
    setCaptionLoading(true);
    setCaptionError("");
    try {
      let res, data;
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(`${API_BASE}/api/instagram/caption/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ persona_num: current.num, image: currentPreview, tone: vibe }),
          signal: ctrl.signal,
        });
        data = await res.json().catch(() => ({}));
        if (res.ok || res.status < 500) break;
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!res.ok || !data?.ok) {
        const detail = data?.detail || data?.error || data;
        if (res.status !== 499) console.debug("[Caption] draft failed:", res.status, detail);
        setCaptionError("캡션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setCaption(data.caption || "");
    } catch (e) {
      if (e?.name !== "AbortError") console.debug("[Caption] draft error:", e);
      setCaptionError("캡션 생성 중 오류가 발생했습니다.");
    } finally {
      setCaptionLoading(false);
      if (captionReqRef.current === ctrl) captionReqRef.current = null;
    }
  };
  const handleDropOnPreview = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setShowPreviewHint(false);
    try {
      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri && /^(data:|https?:)/i.test(uri)) {
        addToPreview(uri.trim());
      }
    } catch (err) {
      console.debug("[Chat] drop parse error", err);
    }
  };

  // Removed auto fly-to-preview animation (manual drag or double-click instead)

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      } catch (err) {
        console.debug("[Chat] scrollIntoView failed", err);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    try {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      }
    } catch (err) {
      console.debug("[Chat] initial scrollIntoView failed", err);
    }
  }, []);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("클립보드에 복사되었습니다");
    } catch {
      alert("복사 실패. 수동으로 복사해주세요.");
    }
  };

  // 마이페이지 이동 + 인스타 연동 자동 시작
  const goConnectInstagram = () => {
    if (!current?.num) {
      alert("먼저 페르소나를 선택해 주세요.");
      return;
    }
    const oauthUrl = `${API_BASE}/oauth/instagram/start?persona_num=${encodeURIComponent(current.num)}&picker=1&fresh=1`;
    // UX: 마이페이지로 먼저 이동 시도 후, 잠시 뒤 자동으로 연동 플로우 시작
    try { nav("/mypage"); } catch {}
    setTimeout(() => { window.location.href = oauthUrl; }, 150);
  };

  // 엔드포인트: POST /chat/image
  // payload: { persona_num, user_text, ls_session_id?, style_img? }
  const generate = async () => {
    if (!current?.num) {
      alert("먼저 페르소나를 선택해 주세요.");
      return;
    }
    const textToUse = (prompt || "").trim();
    setLastPrompt(textToUse);
    // 요청 시작 시 곧바로 입력창 비우기
    setPrompt("");
    setIsGenerating(true);
  // cancel previous image generation request if still pending
  try { imgReqRef.current?.abort(); } catch {}
  const ctrl = new AbortController();
  imgReqRef.current = ctrl;
    const id = Date.now();
    const waitId = id + 0.5;
    setMessages((m) => [
      ...m,
      { id, role: "user", text: textToUse, ts: Date.now() },
      { id: waitId, role: "assistant", loading: true, text: "이미지를 생성 중입니다…", ts: Date.now() },
    ]);
    try {
  // Keep the same outfit only when a style reference is present AND the user didn't ask to change clothes
  const styleLockNote = "Keep the exact same outfit from the style reference image. Do not change garment category, color, material, pattern, length, silhouette, or layers.";
  const instaAspectNote = "Output a single vertical image strictly in 4:5 aspect ratio (portrait for Instagram feed). Aim for approximately 1080x1350 resolution. Fill the frame; no borders or letterboxing.";
      const changeOutfit = wantsDifferentOutfit(textToUse);
      const styleSource = !changeOutfit ? (currentPreview || lastStyleImage) : null;
      const userText = `${textToUse}\n[ASPECT] ${instaAspectNote}` + (styleSource
        ? `\n[STYLE_ENFORCE] ${styleLockNote}`
        : `\n[STYLE_RESET] User requested different outfit — ignore any outfit/style references if present.`);
      const payload = {
        persona_num: current.num,
        user_text: userText,
        ls_session_id: lsSessionId,
      };
      // 스타일 참조 이미지 선택(프리뷰가 우선, 없으면 마지막 생성 이미지)
      if (styleSource) {
        payload.style_img = styleSource;
      }
  // console.debug("[Chat] POST /chat/image ->", payload);
      // Retry once on transient 5xx
      let res, data;
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(`${API_BASE}/api/chat/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        data = await res.json().catch(() => ({}));
        if (res.ok || res.status < 500) break;
        await new Promise((r) => setTimeout(r, 700));
      }
      // console.debug("[Chat] /chat/image response:", res.status, data);
      if (res.ok && data?.ok && data?.image) {
        setMessages((m) => {
          // replace the waiting message
          const others = m.filter((mm) => mm.id !== waitId);
          return [
            ...others,
            { id: id + 1, role: "assistant", text: "이미지를 생성했어요.", image: data.image, ts: Date.now() },
          ];
        });
        // 다음 요청을 위한 숨김 스타일 참조 갱신(사용자가 "다른 옷"을 요청한 경우에는 체인 끊기)
        setLastStyleImage(changeOutfit ? null : data.image);
        // 자동 이동 금지: 사용자가 필요 시 프리뷰로 직접 옮길 수 있도록 힌트만 표시
        setTimeout(() => {
          if (previewImages.length === 0) setShowPreviewHint(true);
        }, 150);
      } else {
        const detail = data?.detail || data?.error || data;
        setMessages((m) => {
          const others = m.filter((mm) => mm.id !== waitId);
          return [
            ...others,
            { id: id + 1, role: "assistant", text: `오류: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`, ts: Date.now() },
          ];
        });
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setMessages((m) => {
        const others = m.filter((mm) => mm.id !== waitId);
        return [...others, { id: id + 1, role: "assistant", text: `요청 실패: ${e}`, ts: Date.now() }];
        });
      }
    } finally {
      setIsGenerating(false);
      if (imgReqRef.current === ctrl) imgReqRef.current = null;
    }
  };

  // 힌트 자동 숨김: 프리뷰가 채워지면, 또는 일정 시간 경과 시
  useEffect(() => {
    if (previewImages.length > 0 && showPreviewHint) setShowPreviewHint(false);
  }, [previewImages.length, showPreviewHint]);
  useEffect(() => {
    if (!showPreviewHint) return;
    const t = setTimeout(() => setShowPreviewHint(false), 8000);
    return () => clearTimeout(t);
  }, [showPreviewHint]);

  // Removed: flight animation cleanup (no auto-move to preview)

  // Start/end LangSmith session helpers
  const startSession = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/session/start`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.ls_session_id) setLsSessionId(data.ls_session_id);
    } catch (err) {
      console.debug("[Chat] startSession failed", err);
    }
  }, []);
  const endSession = React.useCallback(async () => {
    if (!lsSessionId) return;
    try {
      await fetch(`${API_BASE}/api/chat/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ls_session_id: lsSessionId }),
      });
    } catch (err) {
      console.debug("[Chat] endSession failed", err);
    }
  }, [lsSessionId]);
  // End session on unmount (session starts when persona is chosen)
  useEffect(() => {
    return () => { endSession(); };
  }, [endSession]);

  // Abort any in-flight requests on unmount to avoid noisy console errors
  useEffect(() => {
    return () => {
      try { imgReqRef.current?.abort(); } catch {}
      try { captionReqRef.current?.abort(); } catch {}
    };
  }, []);

  // Listen for external open-profile-select and persona events (App coordinates the global modal)
  useEffect(() => {
    const onOpenProfileSelect = () => {
      setAskProfile(true);
      setCurrent(null);
    };
    window.addEventListener("open-profile-select", onOpenProfileSelect);
    // When a new persona is created, just open selector (no auto-pick)
    const onPersonaCreated = () => {
      setAskProfile(true);
      setCurrent(null);
    };
    // App에서 사용자가 선택한 프로필을 직접 주입하는 경우
    const onPersonaChosen = (e) => {
      const p = e?.detail;
      if (!p || !p.num) return;
      const c = { name: p.name, num: p.num, img: p.img, avatar: p.img || avatarFromName(p.name) };
      setCurrent(c);
      setAskProfile(false);
  // Reset chat state and start a fresh session with the selected persona
  setMessages([{ id: 1, role: "assistant", text: "인스타그램을 연동해야 생성된 이미지를 인스타그램에 업로드할 수 있습니다.", ts: Date.now() }]);
      setPreviewImages([]);
      setPreviewIndex(0);
      setShowPreviewHint(false);
      // end previous session (if any) and start a new session now
      (async () => { await endSession(); await startSession(); })();
    };
    window.addEventListener("persona-created", onPersonaCreated);
    window.addEventListener("persona-chosen", onPersonaChosen);
    return () => {
      window.removeEventListener("open-profile-select", onOpenProfileSelect);
      window.removeEventListener("persona-created", onPersonaCreated);
      window.removeEventListener("persona-chosen", onPersonaChosen);
    };
  }, [endSession, startSession]);

  // If we need a profile, request the global selector once
  useEffect(() => {
    if ((askProfile || !current) && !requestedSelectorRef.current) {
      requestedSelectorRef.current = true;
  try { window.dispatchEvent(new CustomEvent("open-profile-select")); } catch (err) { console.debug("[Chat] dispatch open-profile-select failed", err); }
    }
    if (current) {
      requestedSelectorRef.current = false;
    }
  }, [askProfile, current]);

  // If a profile is needed, rely on the App-level global modal and render a lightweight placeholder backdrop
  if (askProfile || !current) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[rgba(15,23,42,0.35)]">
        <div className="text-white text-sm opacity-80">프로필 선택 창이 열렸습니다…</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 grid grid-cols-12 gap-4 h-[calc(100vh-4rem)] min-h-0">
      {/* Center: chat */}
      <main className="col-span-12 xl:col-span-8 rounded-xl border bg-white/80 backdrop-blur flex flex-col min-h-0">
        {/* Header */}
  <div className="px-4 h-12 border-b flex items-center gap-3">
          <img src={current.avatar} alt="avatar" className="size-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-semibold leading-none">{current.name} · Chat Studio</div>
            <div className="text-xs text-neutral-500"></div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setAskProfile(true); try { window.dispatchEvent(new CustomEvent("open-profile-select")); } catch (err) { console.debug("[Chat] dispatch open-profile-select failed", err); } }}>
            프로필 선택
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "assistant" ? "items-start" : "items-end justify-end"}`}>
              {m.role === "assistant" && (
                <img src={current.avatar} className="size-8 rounded-full mr-2" alt="av" />
              )}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[720px] rounded-2xl p-3 shadow-sm ${m.role === "assistant" ? "bg-white border" : "bg-neutral-900 text-white"}`}
              >
                {m.image ? (
                  <div className="space-y-2">
                    {/* 4:5 고정 비율 컨테이너 + 부드러운 등장 애니메이션 */}
                    <div
                      className="relative group rounded-xl overflow-hidden border bg-neutral-100 shadow-sm"
                      style={{ height: 360, aspectRatio: "4 / 5" }}
                    >
                      <motion.img
                        key={m.image}
                        src={m.image}
                        alt="message"
                        className="absolute inset-0 w-full h-full object-cover cursor-grab active:cursor-grabbing"
                        initial={{ opacity: 0, scale: 1.02 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        draggable
                        ref={(el) => {
                          if (el) imgRefs.current.set(m.id, el); else imgRefs.current.delete(m.id);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          addToPreview(m.image);
                        }}
                        onDragStart={(e) => {
                          try {
                            e.dataTransfer.setData("text/uri-list", m.image);
                            e.dataTransfer.setData("text/plain", m.image);
                          } catch {}
                        }}
                      />
                      {/* hover glass overlay */}
                      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
                      </div>
                    </div>
                    <div className="text-xs text-neutral-500">더블클릭하거나 드래그해서 우측 프리뷰에 담을 수 있어요.</div>
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed">
                    {m.loading ? (
                      <div className="space-y-2">
                        <div
                          className="relative rounded-xl overflow-hidden border bg-neutral-100 shadow-sm"
                          style={{ height: 360, aspectRatio: "4 / 5" }}
                        >
                          {/* soft background accents */}
                          <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 via-neutral-200/50 to-neutral-100" />
                          <div className="absolute inset-0 grid place-items-center p-3">
                            <HandwriteLoader />
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500">이미지 생성에는 조금 시간이 걸릴 수 있어요.</div>
                      </div>
                    ) : typeof m.text === "string" && /((인스타그램).*연동|연동.*(인스타그램))/.test(m.text) ? (
                      <div className="inline-flex items-center gap-2">
                        <div className="whitespace-pre-wrap inline">{m.text}</div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="ml-2 rounded-full h-7 px-3 shadow-sm border bg-white/80 text-neutral-700 hover:bg-white"
                          onClick={goConnectInstagram}
                          title="마이페이지로 이동하여 인스타그램 연동을 시작합니다"
                        >
                          마이페이지 바로가기
                          <ChevronsRight className="size-4 ml-1 text-emerald-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    )}
                  </div>
                )}
              </motion.div>
              {m.role === "user" && (
                <div className="ml-2 size-8 rounded-full bg-neutral-200/80 flex items-center justify-center">
                  <User className="size-4" />
                </div>
              )}
            </div>
          ))}
          {/* Anchor element to ensure scrollIntoView targets the end reliably */}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="px-4 py-3 border-t bg-white/90 sticky bottom-0 z-10">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            {/* 얼굴 고정/이전 옷 토글 제거: 항상 자동 적용 */}
            <Button className="ml-auto gap-2" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              {isGenerating ? "생성 중" : "이미지 생성"}
            </Button>
          </div>

          <Label htmlFor="prompt" className="text-xs text-neutral-500">프롬프트</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isGenerating) generate();
              }
            }}
            placeholder="예) 패션쇼 무드의 블랙 드레스, 런웨이 조명, 담백한 포즈"
            className="min-h-20"
          />
        </div>
      </main>

      {/* Right column */}
      <aside className="col-span-12 xl:col-span-4 rounded-xl border bg-white/70 overflow-y-auto min-h-0 flex flex-col">
        <div className="px-4 h-12 border-b flex items-center">
          <div className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4" /> 게시 도우미</div>
        </div>

        <div className="px-4 py-3 flex-1 min-h-0">
          {/* Preview card */}
          <Card className="overflow-hidden h-full flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="size-4" /> 프리뷰</CardTitle>
              <CardDescription>{currentPreview ? "선택된 프리뷰를 확인하세요." : "채팅의 이미지를 이 영역으로 드래그하여 보관하세요."}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col">
              <div
                className={`relative w-full rounded-2xl border-2 ${isDragOver ? "border-sky-500 ring-2 ring-sky-300" : "border-dashed border-neutral-200"}`}
                style={{ aspectRatio: "4/5", overflow: "hidden", height: "min(66vh, calc(100% - 120px))" }}
                ref={previewDropRef}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDropOnPreview}
              >
                {currentPreview ? (
                  <motion.img
                    key={currentPreview}
                    src={currentPreview}
                    alt="preview"
                    className="absolute inset-0 w-full h-full rounded-xl object-cover"
                    initial={{ opacity: 0.0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                  />
                ) : (
                  <div className="absolute inset-0 rounded-2xl flex items-center justify-center text-xs text-neutral-600">
                    {/* 배경 그라디언트 & 장식 블롭 */}
                    <div className="absolute inset-0 bg-linear-to-br from-white via-slate-50 to-violet-50" />
                    <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full bg-rose-200/30 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-12 -right-10 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />

                    {/* 안내 텍스트 + 애니메이션 */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="relative z-10 flex flex-col items-center gap-2"
                    >
                      <div className="text-[13px] font-medium text-neutral-700">이미지를 드래그하여 프리뷰에 담아두세요.</div>
                      <div className="text-[11px] text-neutral-500">아래 점 • 으로 여러 장을 넘겨볼 수 있어요</div>
                      {showPreviewHint && (
                        <motion.div
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ repeat: Infinity, repeatType: "reverse", duration: 0.9 }}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 shadow border"
                        >
                          <ChevronsRight className="size-4 text-emerald-600" />
                          <span className="text-[11px] text-emerald-700">첫 이미지가 생성되었어요! 여기로 드래그 ▶</span>
                        </motion.div>
                      )}
                    </motion.div>
                  </div>
                )}

                {/* Controls overlay - prettier glass buttons */}
                {previewImages.length > 0 && (
                  <>
                    <button
                      aria-label="이전"
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur-sm text-neutral-700 shadow border hover:bg-white disabled:opacity-30"
                      disabled={previewImages.length <= 1}
                      onClick={(e) => {
                        e.preventDefault();
                        setPreviewIndex((i) => (i - 1 + previewImages.length) % previewImages.length);
                      }}
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      aria-label="다음"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur-sm text-neutral-700 shadow border hover:bg-white disabled:opacity-30"
                      disabled={previewImages.length <= 1}
                      onClick={(e) => {
                        e.preventDefault();
                        setPreviewIndex((i) => (i + 1) % previewImages.length);
                      }}
                    >
                      <ChevronRight className="size-5" />
                    </button>
                    <button
                      aria-label="제거"
                      className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 text-neutral-700 shadow border hover:bg-white flex items-center justify-center"
                      onClick={(e) => {
                        e.preventDefault();
                        removeCurrentPreview();
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </>
                )}
                {previewImages.length > 1 && (
                  <div className="absolute inset-x-0 bottom-2 flex items-center justify-center">
                    <div className="flex items-center gap-1 bg-white/70 px-2 py-1 rounded-full shadow">
                      {previewImages.map((_, idx) => (
                        <button
                          key={idx}
                          className={`h-2 w-2 rounded-full ${idx === Math.min(previewIndex, previewImages.length - 1) ? "bg-neutral-800" : "bg-neutral-400"}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setPreviewIndex(idx);
                          }}
                          aria-label={`미리보기 ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Instagram caption inside preview card */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-neutral-600">인스타 캡션</Label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-neutral-500">톤</span>
                    <Select value={vibe} onValueChange={setVibe}>
                      <SelectTrigger className="h-7 w-36" disabled><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="insta">Instagram</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="secondary" onClick={() => copy(caption || "")} disabled={!caption}>복사</Button>
                  </div>
                </div>
                <div className="relative">
                  <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} disabled={captionLoading} placeholder="자동 생성하거나 직접 캡션을 입력해 주세요" className="min-h-[92px] pr-28" />
                  <div className="absolute right-2 bottom-2">
                    {captionLoading ? (
                      <HandwriteLoader label="캡션을 생성 중입니다…" />
                    ) : (
                      <Button size="sm" variant="outline" onClick={autoGenerateCaption} disabled={captionLoading || !currentPreview}>
                        캡션 자동생성
                      </Button>
                    )}
                  </div>
                </div>
                {captionError && (
                  <div className="text-xs text-rose-600">{captionError}</div>
                )}
              </div>
            </CardContent>
            <CardFooter className="justify-center">
              <Button
                size="sm"
                className="gap-2"
                disabled={!currentPreview}
                onClick={uploadToInstagram}
                title={!currentPreview ? "프리뷰 없음" : "데이터 URI도 자동으로 공개 URL로 변환하여 업로드합니다"}
              >
                인스타 업로드
              </Button>
            </CardFooter>
          </Card>
        </div>
      </aside>
    {/* Upload modal */}
    {showUploadModal && (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
        <div className="w-[520px] max-w-[92vw] rounded-2xl bg-white shadow-xl border">
          <div className="p-5 border-b">
            <div className="text-lg font-semibold">인스타 업로드</div>
            <div className="mt-1 text-sm text-neutral-500">이미지를 인스타그램으로 보내는 중…</div>
          </div>
          <div className="p-5 space-y-3">
            {uploadState.step === "publishing" && (
              <div className="text-sm text-neutral-700">{uploadState.message || "요청 중…"}</div>
            )}
            {uploadState.step === "precheck" && (
              <div className="text-sm text-neutral-700">{uploadState.message}</div>
            )}
            {uploadState.step === "auth" && (
              <div className="space-y-2">
                <div className="text-sm text-neutral-800">인스타그램 계정 연동이 필요합니다.</div>
                <Button
                  onClick={() => {
                    const url = `${API_BASE}/oauth/instagram/start?persona_num=${encodeURIComponent(current?.num || "")}&picker=1&fresh=1`;
                    window.location.href = url;
                  }}
                  className="w-full"
                >연동하러 가기</Button>
              </div>
            )}
            {uploadState.step === "done" && (
              <div className="text-sm text-emerald-700">{uploadState.message}</div>
            )}
            {uploadState.step === "error" && (
              <div className="text-sm text-rose-600 whitespace-pre-wrap break-words">{uploadState.error || "오류가 발생했습니다."}</div>
            )}
          </div>
          <div className="p-4 border-t flex items-center justify-end gap-2">
            {uploadState.step !== "publishing" && (
              <Button variant="outline" onClick={() => { setShowUploadModal(false); }}>
                닫기
              </Button>
            )}
          </div>
        </div>
      </div>
    )}
    {/* 안내는 이미지 하단 캡션과 프리뷰 드롭존 하이라이트로 제공 (오버레이 비활성화) */}
    </div>
  );
}
