// App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "@/api/client";
import { useI18n } from "../../i18n/index.js";
import Signup from "./Signup.jsx";
import Imgcreate from "./Imgcreate.jsx";
import MyPage from "./MyPage.jsx";
import Footer from "../../components/Footer.jsx";
import ConsentPage from "./ConsentPage.jsx";
import UserSetup from "./UserSetup.jsx";
import Chat from "./Chat.jsx";
import Alerts from "./Alerts.jsx";
import Profiles from "./Profiles.jsx";
import ManageProfiles from "./ManageProfiles.jsx";
import ChatGateModal from "../components/ChatGateModal.jsx";
import Dashboard from "./Dashboard.jsx";
import DashboardInsights from "./DashboardInsights.jsx";
import DashboardPostInsights from "./DashboardPostInsights.jsx";
import PostInsightDetail from "./PostInsightDetail.jsx";
import ProfileSelect from "./ProfileSelect.jsx";
import Credit from "./Credit.jsx";
// Removed MobilePreview page

const base = "px-3 py-1.5 rounded-full transition";
const active = "bg-blue-600 text-white shadow";
const idle = "text-slate-600 hover:bg-slate-100";

// Social login images (kept as comments)
// Third-party login modal utilities
// import naverImg from "../../img/naver.png";
// import kakaoImg from "../../img/kakao.png";
// import googleImg from "../../img/google.png";
import heroImg from "../../img/hero.png";
import step2Img from "../../img/step2.png";
// import step3Img from "../../img/step3.png"; // replaced by Step3Carousel
import Step3Carousel from "@/components/Step3Carousel.jsx";
import step4Img from "../../img/step4.png";
import step5Img from "../../img/step5.png";
import step6Img from "../../img/step6.png";

// Backend API base comes from .env (VITE_API_BASE); empty string in dev uses Vite proxy

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const focusCooldownRef = useRef(0);
  const { t } = useI18n();

  const refresh = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      setLoading(true);
  // GET /auth/me: fetch current authenticated user (session-based)
  const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });
  if (res.status === 401) { setUser(null); setError(null); return; }
  if (!res.ok) { setUser(null); setError(t('alerts.error.http', { code: res.status })); return; }
      const data = await res.json();
      setUser(data.authenticated ? data.user : null);
      setError(null);
    } catch (err) {
      setUser(null);
  // Use i18n-safe messages to avoid encoding issues
  setError(err?.name === "AbortError" ? t('alerts.error.network') : (err?.message || t('alerts.error.network')));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
  // POST /auth/logout: logout (invalidate session)
  const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
  if (res.ok || res.status === 204) { setUser(null); setError(null); }
  else { setError(t('alerts.error.http', { code: res.status })); }
    } catch (e) {
  setError(e?.message || t('alerts.error.network'));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - focusCooldownRef.current < 3000) return;
      focusCooldownRef.current = now;
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { user, loading, error, refresh, logout, setUser };
}

/* ========================= Intro ========================= */
function WelcomeIntro({ user, onStart, onOpenGate, startHref = "/signup" }) {
  const { lang, t } = useI18n();
  const css = `
    :root{ --brand:#2563EB; --text:#111827; --muted:#9CA3AF; --header-h:64px; }
    .intro-wrap{
      min-height:calc(100dvh - var(--header-h)); width:100%;
      background:#ffffff; text-align:center;
      display:flex; flex-direction:column;
      padding:clamp(12px,3vh,24px) 16px clamp(16px,4vh,28px);
    }
    .intro-content{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:clamp(12px,3vh,28px); }
    .intro-title{ margin:0; font-size:clamp(28px,6.8vw,72px); line-height:1.08; font-weight:900; color:#b3b7be; letter-spacing:.3px; text-align:center; }
    .intro-title .brand{
      background: linear-gradient(90deg, #4DA3FF 0%, #60a5ff 30%, #9ec5ff 50%, #4DA3FF 70%, #3582ff 100%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      position:relative; display:inline-block; animation:shine 2.4s linear infinite;
    }
    .title-pre{ display:block; font-size:clamp(16px,2.6vw,26px); font-weight:800; color:#aeb4bb; letter-spacing:-.2px; margin-bottom:6px; }
    .brand-main{
      display:block; font-size:clamp(42px,8vw,84px); line-height:1; font-weight:900;
      background: linear-gradient(90deg, #4DA3FF 0%, #60a5ff 35%, #2f6cfb 100%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      filter: drop-shadow(0 6px 16px rgba(77,163,255,.22));
    }
    @keyframes shine{
      0%{ filter:drop-shadow(0 0 0 rgba(77,163,255,.0)); }
      50%{ filter:drop-shadow(0 8px 18px rgba(77,163,255,.35)); }
      100%{ filter:drop-shadow(0 0 0 rgba(77,163,255,.0)); }
    }
    .word{
      opacity:0; transform:translateY(10px) scale(.98); filter:blur(6px);
      animation:reveal .8s var(--delay,0s) cubic-bezier(.2,.7,.2,1) forwards;
      display:inline-block;
    }
    /* fallback: explicit delay classes to avoid inline style parsing issues */
    .delay-05{ animation-delay:.05s; }
    .delay-15{ animation-delay:.15s; }
    .delay-25{ animation-delay:.25s; }
    .delay-35{ animation-delay:.35s; }
    @keyframes reveal{ to{ opacity:1; transform:none; filter:blur(0); } }
    .intro-sub{
      margin-top:6px; font-size:clamp(16px,3.2vw,28px); font-weight:900; color:#aab0b7;
      opacity:0; transform:translateY(8px); animation:reveal .9s .5s cubic-bezier(.2,.7,.2,1) forwards;
    }
    .intro-start{
      margin-top:clamp(14px,3vh,26px);
      font-size:clamp(18px,2.8vw,28px);
      font-weight:900;
      text-decoration:none;
      user-select:none;
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding:12px 22px;
      border-radius:999px;
      background: var(--brand);
      color:#ffffff;
      box-shadow:0 10px 20px rgba(37,99,235,.25);
      transition: transform .1s ease, box-shadow .15s ease, background .15s ease;
      opacity:0; transform:translateY(8px); animation:reveal .9s 1s cubic-bezier(.2,.7,.2,1) forwards;
    }
    .intro-start:hover{ transform:translateY(-1px); box-shadow:0 14px 26px rgba(37,99,235,.28); }
    .intro-start:active{ transform:translateY(0); box-shadow:0 8px 16px rgba(37,99,235,.22); }
    .intro-start:focus-visible{ outline:none; box-shadow:0 0 0 4px rgba(37,99,235,.25); }
    @media (prefers-reduced-motion: reduce){
      .word, .intro-sub, .intro-start { animation:none !important; opacity:1 !important; transform:none !important; filter:none !important; }
      .brand-main{ filter:none !important; }
      .intro-title .brand{ animation:none !important; }
    }

    @media (max-height: 720px){
      .intro-wrap{ gap:14px; }
      .intro-start{ margin-top:14px; }
    }
  `;

  const handleClick = (e) => {
  // If logged in, open chat gate modal
    if (user) {
      e.preventDefault();
      onOpenGate?.();
      return;
    }
    // For guests, go to start/signup handler when provided
    if (onStart) { e.preventDefault(); onStart(); }
  };

  return (
    <>
      <style>{css}</style>
      <main className="intro-wrap" aria-label="intro">
        <div className="intro-content">
          {lang === 'en' ? (
            <h1 className="intro-title">
              <span className="title-pre">{t('home.title.pre')}</span>
              <span className="brand-main">{t('home.brand')}</span>
            </h1>
          ) : (
            <h1 className="intro-title">
              <span className="brand">SelfStar</span>
              <span className="word delay-05">{t('home.title.w1')}</span>{' '}
              <span className="word delay-15">{t('home.title.w2')}</span>{' '}
              <span className="word delay-25">{t('home.title.w3')}</span>{' '}
              <span className="word delay-35">{t('home.title.w4')}</span>
            </h1>
          )}
          <div className="intro-sub">{user ? t('home.subtitle.signed') : t('home.subtitle.anon')}</div>
          <a className="intro-start" href={startHref} onClick={handleClick}>{user ? t('home.cta.signed') : t('home.cta.anon')}</a>
        </div>
      </main>
    </>
  );
}

/* ========================= Home ========================= */
function Home({ user, onStart, onOpenGate }) {
  return (
    <>
      <WelcomeIntro user={user} onStart={onStart} onOpenGate={onOpenGate} />
      <LandingSections />
    </>
  );
}

/* ========================= App Shell ========================= */
export default function App() {
  const { t } = useI18n();
  const location = useLocation();
  const { user, logout } = useAuth();
  const qs0 = new URLSearchParams(location.search);
  const isEmbedParam = qs0.get("embed") === "1"; // explicit chrome-hide embed
  const isMobileInnerFrame = qs0.get("mframe") === "1"; // mobile preview inner iframe
  const isFramed = typeof window !== "undefined" && window.parent !== window;
  // Treat inner mobile frame as NOT embedded (show chrome), but still consider other embeds
  const isEmbed = isEmbedParam || (isFramed && !isMobileInnerFrame);
  const isMobilePreview = new URLSearchParams(location.search).get("mobile") === "1";
  // Router navigate util
  const navigate = useNavigate();
  // Mobile sizing params available app-wide
  const __mp = new URLSearchParams(location.search);
  const mobileWidth = isMobilePreview ? (parseInt(__mp.get("mw") || "560", 10) || 560) : undefined;
  const mobileMinH = isMobilePreview ? (parseInt(__mp.get("mh") || "883", 10) || 883) : undefined;

  // Helper: navigate to home respecting app/web mode
  const navigateToHome = useCallback(() => {
    const sp = new URLSearchParams(location.search || "");
    const keepMobile = sp.get("mobile") === "1" || sp.get("mframe") === "1";
    if (sp.get("mframe") === "1") {
      // inside inner frame: keep frame flags
      const q = new URLSearchParams();
      if (keepMobile) {
        q.set("mobile", "1");
        q.set("mframe", "1");
        if (sp.get("mw")) q.set("mw", sp.get("mw"));
        if (sp.get("mh")) q.set("mh", sp.get("mh"));
      }
      navigate({ pathname: "/", search: q.toString() ? `?${q.toString()}` : "" });
      return;
    }
    const q = new URLSearchParams();
    if (keepMobile) {
      q.set("mobile", "1");
      if (sp.get("mw")) q.set("mw", sp.get("mw"));
      if (sp.get("mh")) q.set("mh", sp.get("mh"));
    }
    navigate({ pathname: "/", search: q.toString() ? `?${q.toString()}` : "" });
  }, [location.search, navigate]);


  const [showGate, setShowGate] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showImgcreateModal, setShowImgcreateModal] = useState(false);

  const [imgModalSize, setImgModalSize] = useState({ w: 1200, h: 0 });

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showManageProfiles, setShowManageProfiles] = useState(false);
  const [profileSelectRefreshTick, setProfileSelectRefreshTick] = useState(0);

  // Profile modal close: if currently at /chat, navigate home
  const closeProfileModal = useCallback(() => {
    setShowProfileModal(false);
    try {
      if (location.pathname === "/chat") {
        navigateToHome();
      }
    } catch {}
  }, [location.pathname, navigateToHome]);

  // Open image-create modal when receiving window event
  useEffect(() => {
    const onOpenImgcreate = () => {
      setShowImgcreateModal(true);
    };
    window.addEventListener("open-imgcreate", onOpenImgcreate);
    return () => window.removeEventListener("open-imgcreate", onOpenImgcreate);
  }, []);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e?.data;
      if (!d || !d.type) return;
      if (d.type === "exit-mobile-preview") {
        // Remove mobile flags and optionally sync to provided path
        try {
          const u = new URL(d.path || (location.pathname + location.search), window.location.origin);
          const p = new URLSearchParams(u.search || "");
          p.delete("mobile"); p.delete("mw"); p.delete("mh"); p.delete("mframe");
          navigate({ pathname: u.pathname, search: p.toString() ? `?${p.toString()}` : "" }, { replace: true });
        } catch {}
        return;
      }
      if (d.type === "enter-mobile-preview") {
        try {
          const u = new URL(d.path || (location.pathname + location.search), window.location.origin);
          const p = new URLSearchParams(u.search || "");
          p.set("mobile", "1");
          navigate({ pathname: u.pathname, search: `?${p.toString()}` }, { replace: true });
        } catch {}
        return;
      }
      if (d.type === "imgcreate-size") {
        // Skip dynamic sizing in this embed; keep fixed safe size
        return;
      }
      if (d.type === "persona-created") {
        // Persona created: close iframe, refresh chooser, then open selector
        try { setShowImgcreateModal(false); } catch {}
        setProfileSelectRefreshTick((v) => v + 1);
        if (location.pathname === "/chat") {
          try { window.dispatchEvent(new CustomEvent("open-profile-select")); } catch {}
        } else {
          setShowProfileModal(true);
        }
        return;
      }
      if (d.type === "open-profile-select") {
        // Open profile selector on external request
        setProfileSelectRefreshTick((v) => v + 1);
        setShowProfileModal(true);
        return;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Listen for global events to open/close profile selection
  useEffect(() => {
    const onOpenProfile = () => {
      setProfileSelectRefreshTick((v) => v + 1);
      setShowProfileModal(true);
    };
    window.addEventListener("open-profile-select", onOpenProfile);
    const onOpenManage = () => {
      // 愿由?紐⑤떖 ???뚮뒗 ?좏깮 紐⑤떖???レ븘 以묒꺽???쇳븳??
      setShowProfileModal(false);
      setShowManageProfiles(true);
    };
    window.addEventListener("open-manage-profiles", onOpenManage);
    return () => {
      window.removeEventListener("open-profile-select", onOpenProfile);
      window.removeEventListener("open-manage-profiles", onOpenManage);
    };
  }, []);

  // ?덈줈怨좎묠?쇰줈 /chat 吏곸젒 吏꾩엯 ?? ?대깽????대컢怨?臾닿??섍쾶 利됱떆 ?꾨줈???좏깮 紐⑤떖 ?ㅽ뵂
  useEffect(() => {
    if (!isEmbed && location.pathname === "/chat") {
      setProfileSelectRefreshTick((v) => v + 1);
      setShowProfileModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isEmbed]);

  const Shell = (
    <div className={`min-h-screen flex flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f7f7fb_100%)] text-slate-900 ${isMobilePreview ? 'mobile-emulate' : ''}`}>
      {/* Force-mobile overrides when ?mobile=1 on wide screens */}
      {(!isEmbed && isMobilePreview) && (
        <style>{`
          /* Utility toggles for header overrides */
          .mobile-force-show{ display:inline-flex !important; }
          .mobile-force-flex{ display:flex !important; }
          .mobile-force-hidden{ display:none !important; }

          /* Broad neutralization of md: responsive upgrades so mobile variants remain */
          .mobile-emulate .md\:hidden{ display: initial !important; }
          .mobile-emulate .md\:block{ display: initial !important; }
          .mobile-emulate .md\:inline{ display: initial !important; }
          .mobile-emulate .md\:inline-block{ display: initial !important; }
          .mobile-emulate .md\:flex{ display: initial !important; }
          .mobile-emulate .md\:grid{ display: initial !important; }

          /* Collapse any md: multi-column grids into one column */
          .mobile-emulate [class*="md:grid-cols-"]{ grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }

          /* Reset md: gaps/space-x (best-effort) */
          .mobile-emulate [class*="md:gap-"],
          .mobile-emulate [class*="md:space-x-"],
          .mobile-emulate [class*="md:space-y-"]{ gap: inherit !important; }
        `}</style>
      )}
      {/* Header */}
      {!isEmbed && (
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              className={`md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 ${isMobilePreview ? 'mobile-force-show' : ''}`}
              onClick={() => setMobileNavOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="text-2xl font-extrabold select-none tracking-tight">
              <span className="text-yellow-400">-</span>
              <Link to="/" className="text-blue-600">SelfStar.AI</Link>
              <span className="text-yellow-400">-</span>
            </div>
          </div>
          <nav className={`hidden md:flex items-center gap-5 md:gap-7 text-sm font-semibold ml-36 ${isMobilePreview ? 'mobile-force-hidden' : ''}`}>
            <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : idle}`}>{t('header.home')}</NavLink>
            <NavLink
              to="/chat"
              className={({ isActive }) => `${base} ${isActive ? active : idle}`}
              onClick={(e) => {
                // If logged in, show the chat safety gate modal before navigating
                if (user) {
                  e.preventDefault();
                  setShowGate(true);
                } else {
                  // Guest: navigate to /chat, and proactively ask App to open the profile selector
                  // This complements Chat's own request and avoids timing issues on first mount/iframe mode
                  setTimeout(() => { try { window.dispatchEvent(new CustomEvent("open-profile-select")); } catch {} }, 60);
                }
              }}
            >
              {t('header.chat')}
            </NavLink>
            <NavLink to="/mypage" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>{t('header.mypage')}</NavLink>
            <NavLink to="/alerts" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>{t('header.alerts')}</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5">
                  {user.img ? (
                    <img src={user.img} alt="avatar" className="w-6 h-6 rounded-full object-cover border" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-200" />
                  )}
                  <span className="text-sm font-semibold">{user?.nick || '사용자'}</span>
                </div>
                <button onClick={logout} className="text-xs text-slate-500 hover:text-red-600 underline underline-offset-2" title={t('header.logout')}>
                  {t('header.logout')}
                </button>
              </div>
            ) : (
              <Link to="/signup" className="btn-ghost">{t('header.auth')}</Link>
            )}
          </div>
        </div>
  </header>
  )}

      {/* Mobile nav drawer */}
      {!isEmbed && mobileNavOpen && (
        <div
          className="fixed inset-0 z-1200"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileNavOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          {isMobilePreview ? (
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: mobileWidth || 560 }}>
              <aside
                className="absolute inset-y-0 left-0 bg-white border-r shadow-xl p-4 flex flex-col"
                style={{ width: Math.min(320, (mobileWidth || 560)) }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-extrabold text-blue-600">SelfStar.AI</div>
                  <button
                    aria-label={t('common.close')}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <nav className="mt-2 grid gap-2 text-[15px]">
                  <NavLink to="/" end className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                    onClick={() => setMobileNavOpen(false)}>{t('header.home')}</NavLink>
                  <NavLink to="/chat" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                      onClick={(e) => {
                        if (user) {
                          e.preventDefault();
                          setMobileNavOpen(false);
                          setShowGate(true);
                        } else {
                          // Let router navigate and also proactively request the profile selector
                          setMobileNavOpen(false);
                          setTimeout(() => { try { window.dispatchEvent(new CustomEvent('open-profile-select')); } catch {} }, 60);
                        }
                      }}>{t('header.chat')}</NavLink>
                  <NavLink to="/mypage" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                    onClick={() => setMobileNavOpen(false)}>{t('header.mypage')}</NavLink>
                  <NavLink to="/alerts" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                    onClick={() => setMobileNavOpen(false)}>{t('header.alerts')}</NavLink>
                  <NavLink to="/credits" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                    onClick={() => setMobileNavOpen(false)}>크레딧/요금제</NavLink>
                </nav>
                <div className="mt-auto pt-3 border-t">
                  {user ? (
                    <button className="w-full h-10 rounded-lg border bg-white hover:bg-slate-50 text-slate-700" onClick={() => { setMobileNavOpen(false); logout(); }}>
                      {t('header.logout')}
                    </button>
                  ) : (
                    <Link to="/signup" className="block text-center w-full h-10 leading-10 rounded-lg bg-blue-600 text-white font-bold shadow hover:bg-blue-700" onClick={() => setMobileNavOpen(false)}>
                      {t('header.auth')}
                    </Link>
                  )}
                </div>
              </aside>
            </div>
          ) : (
            <aside
              className="absolute inset-y-0 left-0 w-[min(82vw,320px)] bg-white border-r shadow-xl p-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-extrabold text-blue-600">SelfStar.AI</div>
                <button
                  aria-label={t('common.close')}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white"
                  onClick={() => setMobileNavOpen(false)}
                >
                  ×
                </button>
              </div>
              <nav className="mt-2 grid gap-2 text-[15px]">
                <NavLink to="/" end className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                  onClick={() => setMobileNavOpen(false)}>{t('header.home')}</NavLink>
                <NavLink to="/chat" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                  onClick={(e) => {
                    if (user) {
                      e.preventDefault();
                      setMobileNavOpen(false);
                      setShowGate(true);
                    } else {
                      setMobileNavOpen(false);
                      setTimeout(() => { try { window.dispatchEvent(new CustomEvent('open-profile-select')); } catch {} }, 60);
                    }
                  }}>{t('header.chat')}</NavLink>
                <NavLink to="/mypage" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                  onClick={() => setMobileNavOpen(false)}>{t('header.mypage')}</NavLink>
                <NavLink to="/alerts" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                  onClick={() => setMobileNavOpen(false)}>{t('header.alerts')}</NavLink>
                <NavLink to="/credits" className={({ isActive }) => `${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'} rounded-lg px-3 py-2`}
                  onClick={() => setMobileNavOpen(false)}>크레딧/요금제</NavLink>
              </nav>
              <div className="mt-auto pt-3 border-t">
                {user ? (
                  <button className="w-full h-10 rounded-lg border bg-white hover:bg-slate-50 text-slate-700" onClick={() => { setMobileNavOpen(false); logout(); }}>
                    {t('header.logout')}
                  </button>
                ) : (
                  <Link to="/signup" className="block text-center w-full h-10 leading-10 rounded-lg bg-blue-600 text-white font-bold shadow hover:bg-blue-700" onClick={() => setMobileNavOpen(false)}>
                    {t('header.auth')}
                  </Link>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Routes */}
  <main className={isEmbed ? "" : "flex-1"}>
        <Routes>
          <Route path="/" element={<Home user={user} onStart={undefined} onOpenGate={() => setShowGate(true)} />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/consent" element={<ConsentPage />} />
          <Route path="/setup" element={<UserSetup />} />
          
          <Route path="/imgcreate" element={<Imgcreate />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/profiles/manage" element={<ManageProfiles />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/insights" element={<Dashboard />} />
          <Route path="/dashboard/post-insights" element={<Dashboard />} />
          <Route path="/dashboard/post-insights/:id" element={<PostInsightDetail />} />
          <Route
            path="/mypage"
            element={
              <Private user={user}>
                <MyPage />
              </Private>
            }
          />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/credits" element={<Credit />} />
          {/* Removed route: /preview/mobile */}
        </Routes>
      </main>

  {/* Chat enter gate modal */}
      {!isEmbed && user && showGate && (
        <ChatGateModal
          onCancel={() => {
            setShowGate(false);
            try { navigateToHome(); } catch {}
          }}
          onConfirm={() => {
            setShowGate(false);
            setProfileSelectRefreshTick((v) => v + 1);
            setShowProfileModal(true);
            navigate("/chat");
            // Also broadcast a request so Chat/App in iframe/mobile mode reliably open the selector
            try { window.dispatchEvent(new CustomEvent('open-profile-select')); } catch {}
          }}
        />
      )}

  {/* Imgcreate modal (embedded iframe) */}
      {!isEmbed && showImgcreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16 }}
          onClick={() => setShowImgcreateModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: Math.min(1200, Math.floor((typeof window !== "undefined" ? window.innerWidth : 1920) * 0.96)),
              height: Math.min(Math.floor((typeof window !== "undefined" ? window.innerHeight : 1080) * 0.90), Math.floor((typeof window !== "undefined" ? window.innerHeight : 1080) * 0.96)),
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 30px 70px rgba(2,6,23,.35)",
              background: "#fff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label={t('common.close')}
              onClick={() => {
                // Close and navigate home
                setShowImgcreateModal(false);
                try { navigateToHome(); } catch {}
              }}
              style={{ position: "absolute", top: 10, right: 12, width: 36, height: 36, borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 4px 10px rgba(2,6,23,.08)", cursor: "pointer", fontSize: 18, fontWeight: 800, color: "#334155", zIndex: 2 }}
            >
              ×
            </button>
            <iframe
              title="Image create"
              src="/imgcreate?embed=1"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        </div>
      )}

  {!isEmbed && (location.pathname !== "/chat" || isMobilePreview) && (
    <Footer forceMobile={new URLSearchParams(location.search).get("mobile") === "1"} />
  )}

  {/* Profile select modal */}
      {!isEmbed && showProfileModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-1050 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={closeProfileModal}
        >
          <div
            className="relative w-[min(1200px,96vw)] max-h-[90dvh] rounded-2xl border border-blue-200 bg-white p-4 shadow-[0_30px_70px_rgba(2,6,23,.35)] mx-auto my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label={t('common.close')}
              onClick={closeProfileModal}
              className="absolute top-2.5 right-3 w-9 h-9 rounded-full border bg-white shadow"
            >
              ×
            </button>
            {/* Logged-in: show profile selection */}
            {user ? (
              <ProfileSelect
                maxSlots={4}
                refreshKey={profileSelectRefreshTick}
                onAddProfileClick={() => {
                  setShowProfileModal(false);
                  setShowImgcreateModal(true);
                }}
                onProfileChosen={(p) => {
                  try { if (p?.num) localStorage.setItem("activePersonaNum", String(p.num)); } catch {}
                  try { window.dispatchEvent(new CustomEvent("persona-chosen", { detail: p })); } catch {}
                  setShowProfileModal(false);
                  if (location.pathname !== "/chat") {
                    navigate("/chat");
                  }
                }}
              />
            ) : (
              // Guest: show login prompt
              <div className="px-3 py-4 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 grid place-items-center text-2xl font-black mb-3">🔒</div>
                <h2 className="text-xl font-extrabold tracking-tight mb-1">로그인이 필요합니다</h2>
                <p className="text-slate-600 text-sm mb-4">{t('alerts.error.auth')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-10 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                    onClick={closeProfileModal}
                  >
                    {t('common.close')}
                  </button>
                  <button
                    type="button"
                    className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow"
                    onClick={() => { setShowProfileModal(false); navigate("/signup"); }}
                  >
                    {t('header.auth')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

  {/* Manage profiles modal */}
      {!isEmbed && showManageProfiles && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-1100 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={() => setShowManageProfiles(false)}
        >
          <div
            className="relative w-[min(1100px,96vw)] max-h-[90dvh] rounded-2xl border border-blue-200 bg-white p-4 shadow-[0_30px_70px_rgba(2,6,23,.35)] mx-auto my-auto overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ManageProfiles
              embedded
              onClose={() => { setShowManageProfiles(false); navigateToHome(); }}
              
              onRequestCreateNew={() => {
                setShowManageProfiles(false);
                setShowImgcreateModal(true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (isMobilePreview && !isMobileInnerFrame) {
    // Emulate devtools mobile: render the app itself inside a centered iframe
    // with fixed mobile viewport width; inside the iframe we set embed=1 so
    // header/footer/shell from parent do not duplicate.
    const deviceW = mobileWidth || 560; // default width
    const deviceH = mobileMinH || 883; // default height (for initial viewport)
  const params = new URLSearchParams(location.search || "");
  // load inner as mobile frame (prevent recursion, show chrome)
  params.set("mobile", "1");
  params.set("mframe", "1");
  // persist sizing so inner can anchor drawer/layout widths correctly
  if (!params.get("mw")) params.set("mw", String(deviceW));
  if (!params.get("mh")) params.set("mh", String(deviceH));
  // ensure no explicit embed=1 that hides chrome
  params.delete("embed");
  const src = `${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    return (
      <div className="min-h-dvh bg-white">
        <div className="mx-auto" style={{ width: deviceW }}>
          <iframe
            title="App mobile emulation"
            src={src}
            style={{ width: deviceW, height: "100dvh", minHeight: deviceH, border: 0, display: 'block' }}
          />
        </div>
      </div>
    );
  }

  return Shell;
}

/* ========================= Private ========================= */
function Private({ user, children }) {
  return (
    <>
      {!user ? (
        <div className="mx-auto max-w-4xl px-6 py-12 text-slate-500">{useI18n().t('alerts.error.auth')}</div>
      ) : (
        children
      )}
    </>
  );
}


/* ========================= UI Utilities ========================= */
// ?쒓굅: 紐⑤떖/?앹삤踰?愿??而댄룷?뚰듃?????댁긽 ?ъ슜?섏? ?딆쓬

/* ========================= Reveal / Landing ========================= */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShow(true); io.unobserve(el); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, show];
}

function Reveal({ children, from = "up", delay = 0 }) {
  const [ref, show] = useInView(0.15);
  const start =
    "reveal-anim reveal-hide " +
    (from === "left" ? "from-left" : from === "right" ? "from-right" : from === "down" ? "from-down" : "from-up");
  return (
    <div ref={ref} className={show ? "reveal-anim reveal-show to-center" : start} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function LandingSections() {
  const { t } = useI18n();
  return (
    <section className="bg-[#ecf5ff]/50 border-t">
      <div className="mx-auto max-w-6xl px-6 py-16 space-y-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <Reveal from="left">
            <img src={heroImg} alt="hero" className="w-full rounded-2xl shadow border object-cover" />
          </Reveal>

          <div className="space-y-4">
            <Reveal from="right" delay={120}>
              <div className="card p-6 mb-2">
                <div className="text-3xl font-black text-blue-500 mb-3">01</div>
                <p className="text-slate-700 leading-relaxed">{t('home.landing.s1.desc')}</p>
              </div>
            </Reveal>

            <Reveal from="up" delay={200}>
              <div className="flex items-center justify-center gap-3 mr-12">
                <span className="text-2xl md:text-3xl text-blue-600">{t('home.landing.step', { n: 1 })}</span>
                <span className="text-slate-500">{t('home.landing.s1.title')}</span>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <Reveal from="left">
              <div className="card p-6">
                <div className="text-3xl font-black text-blue-500 mb-3">02</div>
                <p className="text-slate-700">{t('home.landing.s2.desc')}</p>
              </div>
            </Reveal>

            <Reveal from="up" delay={100}>
              <div className="flex items-center justify-center gap-3 mr-24">
                <span className="text-2xl md:text-3xl text-blue-600">{t('home.landing.step', { n: 2 })}</span>
                <span className="text-slate-500 mr-3 mt-1">{t('home.landing.s2.title')}</span>
              </div>
            </Reveal>
          </div>

          <Reveal from="right" delay={120}>
            <img src={step2Img} alt="step2" className="w-full rounded-2xl shadow border" />
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <Reveal from="left">
            <Step3Carousel />
          </Reveal>

          <div className="space-y-4">
            <Reveal from="right" delay={120}>
              <div className="card p-6">
                <div className="text-3xl font-black text-blue-500 mb-3">03</div>
                <p className="text-slate-700">{t('home.landing.s3.desc')}</p>
              </div>
            </Reveal>

            <Reveal from="up" delay={200}>
              <div className="flex items-center justify-center gap-3 mr-24">
                <span className="text-2xl md:text-3xl text-blue-600">{t('home.landing.step', { n: 3 })}</span>
                <span className="text-slate-500">{t('home.landing.s3.title')}</span>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Reveal from="up">
            <div className="card p-6">
              <div className="text-3xl font-black text-blue-500 mb-3">04</div>
              <div className="aspect-[4/3] w-full mb-4 overflow-hidden rounded-xl">
                <img src={step4Img} alt="step4" className="w-full h-full object-cover" />
              </div>
              <div className="text-center text-slate-700 font-semibold text-lg">{t('home.landing.s4.title')}</div>
            </div>
          </Reveal>
          <Reveal from="up" delay={80}>
            <div className="card p-6">
              <div className="text-3xl font-black text-blue-500 mb-3">05</div>
              <div className="aspect-[4/3] w-full mb-4 overflow-hidden rounded-xl">
                <img src={step5Img} alt="step5" className="w-full h-full object-cover" />
              </div>
              <div className="text-center text-slate-700 font-semibold text-lg">{t('home.landing.s5.title')}</div>
            </div>
          </Reveal>
          <Reveal from="up" delay={160}>
            <div className="card p-6">
              <div className="text-3xl font-black text-blue-500 mb-3">06</div>
              <div className="aspect-[4/3] w-full mb-4 overflow-hidden rounded-xl">
                <img src={step6Img} alt="step6" className="w-full h-full object-cover" />
              </div>
              <div className="text-center text-slate-700 font-semibold text-lg">{t('home.landing.s6.title')}</div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

