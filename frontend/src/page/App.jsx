// App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "@/api/client";
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

const base = "px-3 py-1.5 rounded-full transition";
const active = "bg-blue-600 text-white shadow";
const idle = "text-slate-600 hover:bg-slate-100";

// 이미지
// 소셜 로그인 아이콘은 모달 제거로 미사용
// import naverImg from "../../img/naver.png";
// import kakaoImg from "../../img/kakao.png";
// import googleImg from "../../img/google.png";
import heroImg from "../../img/hero.png";
import step2Img from "../../img/step2.png";
// import step3Img from "../../img/step3.png"; // replaced by Step3Carousel
import Step3Carousel from "@/components/Step3Carousel.jsx";

// Backend API base comes from .env (VITE_API_BASE); empty string in dev uses Vite proxy

/* =============== 세션 사용자 훅 =============== */
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const focusCooldownRef = useRef(0);

  const refresh = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      setLoading(true);
      // GET /auth/me: 현재 로그인 사용자 정보 조회 (세션 포함)
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (res.status === 401) { setUser(null); setError(null); return; }
      if (!res.ok) { setUser(null); setError(`서버 오류: HTTP ${res.status}`); return; }
      const data = await res.json();
      setUser(data.authenticated ? data.user : null);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err?.name === "AbortError" ? "요청 시간 초과" : (err?.message || "네트워크 오류"));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // POST /auth/logout: 로그아웃 (세션 무효화)
      const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
      if (res.ok || res.status === 204) { setUser(null); setError(null); }
      else { setError(`로그아웃 실패: HTTP ${res.status}`); }
    } catch (e) {
      setError(e?.message || "로그아웃 중 오류");
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

/* ========================= Intro (애니메이션 추가) ========================= */
function WelcomeIntro({ user, onStart, onOpenGate, startHref = "/signup" }) {
  const css = `
    :root{ --brand:#2563EB; --text:#111827; --muted:#9CA3AF; --header-h:64px; }
    .intro-wrap{
      /* 헤더를 제외한 1 화면 꽉 차게 */
      min-height:calc(100dvh - var(--header-h)); width:100%;
      background:#ffffff; text-align:center;
      display:flex; flex-direction:column; /* 상단/하단 영역 분리 */
      padding:clamp(12px,3vh,24px) 16px clamp(16px,4vh,28px);
    }
    /* 중앙 컨텐츠(타이틀/부제/시작하기)를 세로 중앙 정렬 */
    .intro-content{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:clamp(12px,3vh,28px); }
    .intro-title{
      margin:0; font-size:clamp(28px,6.8vw,72px); line-height:1.08;
      font-weight:900; color:#b3b7be; letter-spacing:.3px;
    }
    .intro-title .brand{
      background: linear-gradient(90deg, #4DA3FF 0%, #60a5ff 30%, #9ec5ff 50%, #4DA3FF 70%, #3582ff 100%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      position:relative; display:inline-block;
      animation:shine 2.4s linear infinite;
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
      .intro-title .brand{ animation:none !important; }
    }

    /* 작은 세로 화면에서 여백 축소 */
    @media (max-height: 720px){
      .intro-wrap{ gap:14px; }
      .intro-start{ margin-top:14px; }
    }
  `;

  const handleClick = (e) => {
    // 로그인 상태면 게이트 모달을 연다
    if (user) {
      e.preventDefault();
      onOpenGate?.();
      return;
    }
    // 비로그인 사용자는 가입/로그인 플로우 유지
    if (onStart) { e.preventDefault(); onStart(); }
  };

  return (
    <>
      <style>{css}</style>
      <main className="intro-wrap" aria-label="인트로">
        <div className="intro-content">
          <h1 className="intro-title">
            <span className="brand">SelfStar</span>
            <span className="word" style={{ ["--delay"]: "0.05s" }}>에</span>{" "}
            <span className="word" style={{ ["--delay"]: "0.15s" }}>오신</span>{" "}
            <span className="word" style={{ ["--delay"]: "0.25s" }}>것을</span>{" "}
            <span className="word" style={{ ["--delay"]: "0.35s" }}>환영합니다.</span>
          </h1>
          <div className="intro-sub">{user ? "채팅을 시작해보세요." : "인물을 생성하여 활동해보세요."}</div>
          <a className="intro-start" href={startHref} onClick={handleClick}>{user ? "채팅 시작" : "시작하기"}</a>
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
  const location = useLocation();
  const { user, logout } = useAuth();
  const isEmbedParam = new URLSearchParams(location.search).get("embed") === "1";
  const isFramed = typeof window !== "undefined" && window.parent !== window;
  const isEmbed = isEmbedParam || isFramed;
  // 모달 대신 /signup 라우트로 이동하므로 관련 상태 제거
  const navigate = useNavigate();

  // Chat/Imgcreate 모달 상태
  const [showGate, setShowGate] = useState(false);
  const [showImgcreateModal, setShowImgcreateModal] = useState(false);
  // 모달 기본 크기(이전과 동일 체감): ProfileSelect와 유사한 1200px/90vh 규칙
  const [imgModalSize, setImgModalSize] = useState({ w: 1200, h: 0 });

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showManageProfiles, setShowManageProfiles] = useState(false);
  const [profileSelectRefreshTick, setProfileSelectRefreshTick] = useState(0);

  // 프로필 선택 모달 닫기 동작: /chat 경로에서 닫히면 홈으로 이동
  const closeProfileModal = useCallback(() => {
    setShowProfileModal(false);
    try {
      if (location.pathname === "/chat") {
        navigate("/");
      }
    } catch {}
  }, [location.pathname, navigate]);

  // 외부에서(예: Chat) 이미지 생성 모달을 열라는 신호
  useEffect(() => {
    const onOpenImgcreate = () => {
      setShowImgcreateModal(true);
    };
    window.addEventListener("open-imgcreate", onOpenImgcreate);
    return () => window.removeEventListener("open-imgcreate", onOpenImgcreate);
  }, []);

  // Imgcreate(iframe)에서 넘어오는 메시지 처리 (크기 메시지는 무시하여 고정 크기 유지)
  useEffect(() => {
    const onMsg = (e) => {
      const d = e?.data;
      if (!d || !d.type) return;
      if (d.type === "imgcreate-size") {
        // 이전에는 크기 자동 조절을 했으나, 요청에 따라 고정 크기 유지
        return;
      }
      if (d.type === "persona-created") {
        // 새 프로필 생성 완료: 크리에이터 모달 닫고, 프로필 선택 모달을 열어 새 항목을 보여준다
        try { setShowImgcreateModal(false); } catch {}
        setProfileSelectRefreshTick((v) => v + 1);
        // 채팅 페이지에서는 채팅의 선택 플로우를 사용하고, 그 외에는 전역 모달을 연다
        if (location.pathname === "/chat") {
          try { window.dispatchEvent(new CustomEvent("open-profile-select")); } catch {}
        } else {
          setShowProfileModal(true);
        }
        return;
      }
      if (d.type === "open-profile-select") {
        // 외부(iframe 등)에서 열린 요청도 전역 모달로 처리
        setProfileSelectRefreshTick((v) => v + 1);
        setShowProfileModal(true);
        return;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 전역 커스텀 이벤트로도 프로필 선택 모달을 열 수 있게 처리
  useEffect(() => {
    const onOpenProfile = () => {
      setProfileSelectRefreshTick((v) => v + 1);
      setShowProfileModal(true);
    };
    window.addEventListener("open-profile-select", onOpenProfile);
    const onOpenManage = () => {
      // 관리 모달 열 때는 선택 모달을 닫아 중첩을 피한다
      setShowProfileModal(false);
      setShowManageProfiles(true);
    };
    window.addEventListener("open-manage-profiles", onOpenManage);
    return () => {
      window.removeEventListener("open-profile-select", onOpenProfile);
      window.removeEventListener("open-manage-profiles", onOpenManage);
    };
  }, []);

  // 새로고침으로 /chat 직접 진입 시, 이벤트 타이밍과 무관하게 즉시 프로필 선택 모달 오픈
  useEffect(() => {
    if (!isEmbed && location.pathname === "/chat") {
      setProfileSelectRefreshTick((v) => v + 1);
      setShowProfileModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isEmbed]);

  // Chat은 /chat 진입 전 게이트 모달을 통해 진입

  return (
    <div className="min-h-screen flex flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f7f7fb_100%)] text-slate-900">
      {/* Header */}
      {!isEmbed && (
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="text-2xl font-extrabold select-none tracking-tight">
            <span className="text-yellow-400">-</span>
            <Link to="/" className="text-blue-600">SelfStar.AI</Link>
            <span className="text-yellow-400">-</span>
          </div>
          <nav className="hidden md:flex items-center gap-5 md:gap-7 text-sm font-semibold ml-36">
            <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : idle}`}>홈</NavLink>
            <NavLink
              to="/chat"
              className={({ isActive }) => `${base} ${isActive ? active : idle}`}
              onClick={(e) => {
                // 로그인 사용자는 헤더에서 채팅 클릭 시에도 게이트 모달을 먼저 띄움
                if (user) { e.preventDefault(); setShowGate(true); }
              }}
            >
              채팅
            </NavLink>
            <NavLink to="/mypage" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>마이페이지</NavLink>
            <NavLink to="/alerts" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>알림</NavLink>
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
                  <span className="text-sm font-semibold">{user.nick || "사용자"}</span>
                </div>
                <button onClick={logout} className="text-xs text-slate-500 hover:text-red-600 underline underline-offset-2" title="로그아웃">
                  로그아웃
                </button>
              </div>
            ) : (
              <Link to="/signup" className="btn-ghost">회원가입 / 로그인</Link>
            )}
          </div>
        </div>
  </header>
  )}

      {/* Routes */}
  <main className={isEmbed ? "" : "flex-1"}>
        <Routes>
          <Route path="/" element={<Home user={user} onStart={undefined} onOpenGate={() => setShowGate(true)} />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/consent" element={<ConsentPage />} />
          <Route path="/setup" element={<UserSetup />} />
          {/* Imgcreate는 모달로도 띄우지만, 라우트 직접 접근도 허용 */}
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
        </Routes>
      </main>

      {/* Chat 진입 게이트 모달 */}
      {/* Chat 진입 게이트 모달 */}
      {!isEmbed && user && showGate && (
        <ChatGateModal
          onCancel={() => setShowGate(false)}
          onConfirm={() => {
            setShowGate(false);
            // 채팅 입장 시 항상 프로필 셀렉트가 열리도록 전역 모달을 켠다
            setProfileSelectRefreshTick((v) => v + 1);
            setShowProfileModal(true);
            navigate("/chat");
          }}
        />
      )}

      {/* Imgcreate 모달: 동일 출처 iframe으로 페이지 자체를 내장 렌더링(스타일 붕괴 방지) */}
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
              // ProfileSelect와 동일한 체감 크기: min(1200px, 96vw) x max 90dvh
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
              aria-label="닫기"
              onClick={() => {
                // X 버튼 클릭 시 메인으로 이동하며 모달을 닫습니다.
                setShowImgcreateModal(false);
                try { navigate("/"); } catch {}
              }}
              style={{ position: "absolute", top: 10, right: 12, width: 36, height: 36, borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 4px 10px rgba(2,6,23,.08)", cursor: "pointer", fontSize: 18, fontWeight: 800, color: "#334155", zIndex: 2 }}
            >
              ×
            </button>
            <iframe
              title="이미지 생성"
              src="/imgcreate?embed=1"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        </div>
      )}

  {!isEmbed && location.pathname !== "/chat" && <Footer />}

      {/* 전역 프로필 선택 모달: 어디서든 불러 사용할 수 있도록 App 레벨에서 제공 */}
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
              aria-label="닫기"
              onClick={closeProfileModal}
              className="absolute top-2.5 right-3 w-9 h-9 rounded-full border bg-white shadow"
            >
              ×
            </button>
            {/* 로그인 상태에 따라 모달 내용을 분기 */}
            {user ? (
              // ProfileSelect: 선택 시 persona-chosen 이벤트를 전파하고 필요시 채팅으로 이동
              <ProfileSelect
                maxSlots={4}
                refreshKey={profileSelectRefreshTick}
                onAddProfileClick={() => {
                  setShowProfileModal(false);
                  // 이미지 생성 모달 열기
                  setShowImgcreateModal(true);
                }}
                onProfileChosen={(p) => {
                  try { if (p?.num) localStorage.setItem("activePersonaNum", String(p.num)); } catch {}
                  try { window.dispatchEvent(new CustomEvent("persona-chosen", { detail: p })); } catch {}
                  setShowProfileModal(false);
                  // 채팅으로 이동하거나, 이미 채팅이면 그대로 유지(채팅은 이벤트를 받아 새로고침)
                  if (location.pathname !== "/chat") {
                    navigate("/chat");
                  }
                }}
              />
            ) : (
              // 비로그인: 로그인 유도 뷰 표시
              <div className="px-3 py-4 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 grid place-items-center text-2xl font-black mb-3">🔐</div>
                <h2 className="text-xl font-extrabold tracking-tight mb-1">로그인이 필요합니다</h2>
                <p className="text-slate-600 text-sm mb-4">채팅을 시작하려면 먼저 로그인해주세요. 로그인 후 프로필을 선택하거나 새로 만들 수 있어요.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-10 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                    onClick={() => setShowProfileModal(false)}
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow"
                    onClick={() => { setShowProfileModal(false); navigate("/signup"); }}
                  >
                    로그인 바로가기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 전역 프로필 관리 모달: 선택/이미지 생성 모달과 겹치지 않도록 별도 제어 */}
      {!isEmbed && showManageProfiles && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={() => setShowManageProfiles(false)}
        >
          <div
            className="relative w-[min(1100px,96vw)] max-h-[90dvh] rounded-2xl border border-blue-200 bg-white p-4 shadow-[0_30px_70px_rgba(2,6,23,.35)] mx-auto my-auto overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ManageProfiles
              embedded
              onClose={() => { setShowManageProfiles(false); navigate('/'); }}
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
}

/* ========================= 보호 라우트 ========================= */
function Private({ user, children }) {
  return (
    <>
      {!user ? (
        <div className="mx-auto max-w-4xl px-6 py-12 text-slate-500">로그인이 필요합니다.</div>
      ) : (
        children
      )}
    </>
  );
}


/* ========================= UI Utilities ========================= */
// 제거: 모달/팝오버 관련 컴포넌트는 더 이상 사용하지 않음

/* ========================= Reveal / Landing (자리표시용) ========================= */
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
                <p className="text-slate-700 leading-relaxed">
                  캠퍼스 무드 그대로, <br />
                  나만의 AI 인플루언서를 지금 우리 서비스에서 시작해보세요!
                </p>
              </div>
            </Reveal>

            <Reveal from="up" delay={200}>
              <div className="flex items-center justify-center gap-3 mr-12">
                <span className="text-2xl md:text-3xl text-blue-600">»» Step 1</span>
                <span className="text-slate-500">인플루언서 이름과 특징 · 옵션을 선택해주세요.</span>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <Reveal from="left">
              <div className="card p-6">
                <div className="text-3xl font-black text-blue-500 mb-3">02</div>
                <p className="text-slate-700">요청한 이미지를 기반으로 멋진 결과물을 제작해드립니다.</p>
              </div>
            </Reveal>

            <Reveal from="up" delay={100}>
              <div className="flex items-center justify-center gap-3 mr-24">
                <span className="text-2xl md:text-3xl text-blue-600">»» Step 2</span>
                <span className="text-slate-500 mr-3 mt-1">방법은 간단하게, 결과물은 퀄리티 높게</span>
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
                <p className="text-slate-700">계정 연동 시 Instagram &amp; Thread 자동 업로드 및 댓글까지!</p>
              </div>
            </Reveal>

            <Reveal from="up" delay={200}>
              <div className="flex items-center justify-center gap-3 mr-24">
                <span className="text-2xl md:text-3xl text-blue-600">»» Step 3</span>
                <span className="text-slate-500">연동 설정 후 자동 운영을 시작해보세요.</span>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Reveal from="up">
            <div className="card h-48 md:h-56 p-4">
              <b className="text-blue-500">04</b>
              <div className="text-slate-500 mt-2">업데이트 예정</div>
            </div>
          </Reveal>
          <Reveal from="up" delay={80}>
            <div className="card h-48 md:h-56 p-4 mt-10">
              <b className="text-blue-500">05</b>
              <div className="text-slate-500 mt-2">업데이트 예정</div>
            </div>
          </Reveal>
          <Reveal from="up" delay={160}>
            <div className="card h-48 md:h-56 p-4 mt-20">
              <b className="text-blue-500">06</b>
              <div className="text-slate-500 mt-2">업데이트 예정</div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
