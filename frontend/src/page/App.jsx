// App.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import Footer from "../../components/Footer.jsx";
// import MyPage from "./MyPage.jsx";
// import Chat from "./Chat.jsx";

const base = "px-3 py-1.5 rounded-full transition";
const active = "bg-blue-600 text-white shadow";
const idle = "text-slate-600 hover:bg-slate-100";

const guideImg = "./img/fixed_face.png";
const naverImg = "./img/naver.png";
const kakaoImg = "./img/kakao.png";
const googleImg = "./img/google.png";

const API = "";

/* =============== 세션 사용자 훅 =============== */
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 포커스 이벤트 과다 호출 방지
  const focusCooldownRef = useRef(0);

  const refresh = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    try {
      setLoading(true);

      const res = await fetch(`${API}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });

      if (res.status === 401) {
        setUser(null);
        setError(null);
        return;
      }
      if (!res.ok) {
        setUser(null);
        setError(`서버 오류: HTTP ${res.status}`);
        return;
      }

      const data = await res.json();
      console.log("[auth/me]", data);
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
      const res = await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        setUser(null);
        setError(null);
      } else {
        setError(`로그아웃 실패: HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e?.message || "로그아웃 중 오류");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

/* ========================= Home ========================= */
function Home() {
  const [name, setName] = useState("이빛나");
  const [gender, setGender] = useState("여");
  const [feature, setFeature] = useState("");
  const options = useMemo(() => ["안경", "선글라스", "귀걸이", "반지", "시계", "블러쉬", "주근깨"], []);
  const [selected, setSelected] = useState([]);
  const toggle = (opt) =>
    setSelected((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]));

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* 좌측 미리보기 카드 */}
          <section className="card overflow-hidden">
            <div className="bg-black flex items-center justify-center">
              <div className="relative w-[520px] h-[520px]">
                <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_10%_0%,rgba(255,255,255,0.12),transparent_60%)] pointer-events-none" />
              </div>
            </div>
            <div className="p-5 bg-blue-50">
              <h3 className="text-2xl font-semibold mb-1 tracking-tight">나만의 인플루언서를 만들어보세요.</h3>
              <p className="text-sm text-slate-600">얼굴 ID를 고정하여 다양한 이미지를 구축할 수 있습니다.</p>
            </div>
          </section>

          {/* 우측 입력 카드 */}
          <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] relative w-[520px] h-[618px]">
            <div className="flex items-start gap-3 mb-5">
              <img src={guideImg} alt="guide" className="w-11 h-11 rounded-full object-cover border" />
              <div className="text-sm px-4 py-2 rounded-lg border border-blue-300 bg-white/70">
                저는 <b>SelfStar.AI</b> 가이드 <b>이빛나</b>라고 합니다. <br />
                인플루언서의 <b>이름</b>과 <b>옵션</b> 및 <b>특징</b>을 <b>입력</b>해주세요.
              </div>
            </div>

            <Field label="이름">
              <input
                className="w-full px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이빛나"
              />
            </Field>

            <Field label="성별">
              <div className="relative">
                <select
                  className="w-full appearance-none px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option>여</option>
                  <option>남</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
              </div>
            </Field>

            <div className="mb-2 text-sm font-semibold">
              특징 <span className="text-slate-400">· 인플루언서의 특징을 작성해주세요.</span>
            </div>
            <Field>
              <input
                className="w-full px-4 py-2 rounded-lg border border-blue-200 bg-white/70 placeholder:text-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                placeholder="ex) 귀여운 이미지"
              />
            </Field>

            <div className="mb-2 text-sm font-semibold">
              옵션 <span className="text-slate-400">· 중복 선택 가능</span>
            </div>
            <div className="flex flex-wrap gap-3 mb-8">
              {options.map((opt) => {
                const on = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={"chip " + (on ? "border-blue-400 bg-white text-blue-700 shadow-sm" : "")}
                    aria-pressed={on}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end mt-20 mr-1">
              <button className="btn-primary" onClick={() => alert("인플루언서 생성 준비중입니다.")}>
                인플루언서 생성
              </button>
            </div>
          </section>
        </div>

        <div className="flex flex-col items-center mt-10 text-slate-400">
          <div className="scroll-mouse"></div>
          <p className="text-xs mt-2">스크롤을 내려주세요.</p>
        </div>
      </main>

      <LandingSections />
    </>
  );
}

/* ========================= App Shell ========================= */
export default function App() {
  const { user, loading, logout } = useAuth();

  const [openSignUp, setOpenSignUp] = useState(false);
  const [openLogin, setOpenLogin] = useState(false);
  const signRef = useRef(null);
  const loginRef = useRef(null);

  // 팝오버 바깥 클릭 닫기
  useEffect(() => {
    const onClick = (e) => {
      if (signRef.current && !signRef.current.contains(e.target)) setOpenSignUp(false);
      if (loginRef.current && !loginRef.current.contains(e.target)) setOpenLogin(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500">
        <div className="text-sm">세션 확인중…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f7f7fb_100%)] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          {/* 로고: Link 한 번만 사용 (중첩 방지) */}
          <div className="text-2xl font-extrabold select-none tracking-tight">
            <span className="text-yellow-400">-</span>
            <Link to="/" className="text-blue-600">SelfStar.AI</Link>
            <span className="text-yellow-400">-</span>
          </div>

          {/* 네비게이션: NavLink만 각각 사용 (중첩 없음) */}
          <nav className="hidden md:flex items-center gap-5 md:gap-7 text-sm font-semibold ml-36">
            <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : idle}`}>홈</NavLink>
            <NavLink to="/chat" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>채팅</NavLink>
            <NavLink to="/mypage" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>마이페이지</NavLink>
            <NavLink to="/alerts" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>알림</NavLink>
          </nav>

          {/* 오른쪽 액션: 로그인 전/후 분기 */}
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
                <button
                  onClick={logout}
                  className="text-xs text-slate-500 hover:text-red-600 underline underline-offset-2"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <>
                <div className="relative" ref={signRef}>
                  <button
                    className={"btn-ghost " + (openSignUp ? "ring-2 ring-slate-300" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSignUp((v) => !v);
                      setOpenLogin(false);
                    }}
                  >
                    무료로 회원가입
                  </button>
                  {openSignUp && (
                    <Popover>
                      <p className="text-sm text-slate-500 mb-3">무료 회원가입</p>
                      <div className="flex flex-col gap-3">
                        <AuthItem label="네이버로 회원가입" img={naverImg} href={API ? `${API}/auth/naver` : "/auth/naver"} />
                        <AuthItem label="카카오로 회원가입" img={kakaoImg} href={API ? `${API}/auth/kakao` : "/auth/kakao"} />
                        <AuthItem label="Google로 회원가입" img={googleImg} href={API ? `${API}/auth/google` : "/auth/google"} />
                      </div>
                    </Popover>
                  )}
                </div>

                <div className="relative" ref={loginRef}>
                  <button
                    className={"btn-ghost " + (openLogin ? "ring-2 ring-slate-300" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenLogin((v) => !v);
                      setOpenSignUp(false);
                    }}
                  >
                    로그인
                  </button>
                  {openLogin && (
                    <Popover>
                      <p className="text-sm text-slate-500 mb-3">간편 로그인</p>
                      <div className="flex flex-col gap-3">
                        <AuthItem label="네이버로 로그인" img={naverImg} href={API ? `${API}/auth/naver` : "/auth/naver"} />
                        <AuthItem label="카카오로 로그인" img={kakaoImg} href={API ? `${API}/auth/kakao` : "/auth/kakao"} />
                        <AuthItem label="Google로 로그인" img={googleImg} href={API ? `${API}/auth/google` : "/auth/google"} />
                      </div>
                    </Popover>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Routes */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          {/*
          <Route
            path="/mypage"
            element={
              <Private user={user}>
                <MyPage />
              </Private>
            }
          />
          <Route path="/chat" element={<Chat />} />
          */}
          <Route path="/alerts" element={<Alerts />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

/* ========================= 보호 라우트 ========================= */
function Private({ user, children }) {
  if (!user) return <div className="mx-auto max-w-4xl px-6 py-12 text-slate-500">로그인이 필요합니다.</div>;
  return children;
}

/* ========================= 단순 알림 페이지 ========================= */
function Alerts() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h2 className="text-xl font-bold mb-2">알림</h2>
      <p className="text-slate-600">알림 기능은 준비 중입니다.</p>
    </div>
  );
}

/* ========================= UI Utilities ========================= */
function Popover({ children }) {
  return (
    <div
      className="absolute top-full right-0 mt-3 w-[380px] rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(2,6,23,0.12)] p-5 z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-5">
      {label && <label className="block mb-2 text-sm font-semibold">{label}</label>}
      {children}
      {hint && <p className="mt-2 text-xs text-blue-500/80">{hint}</p>}
    </div>
  );
}

function AuthItem({ label, img, href }) {
  return (
    <a
      href={href}
      className="w-full flex items-center justify-start gap-3 px-6 py-3 rounded-full border border-gray-300 bg-white hover:bg-gray-50 transition"
    >
      {img ? (
        <img src={img} alt="" className="w-5 h-5 object-contain" />
      ) : (
        <span className="w-3 h-3 rounded-full bg-gray-300" />
      )}
      <span>{label}</span>
    </a>
  );
}

/* ========================= Reveal / Landing ========================= */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          io.unobserve(el);
        }
      },
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
  const hero = "./img/hero.png";
  const step1 = "./img/step1.png";
  const step2 = "./img/step2.png";
  const step3 = "./img/step3.png";

  return (
    <section className="bg-[#ecf5ff]/50 border-t">
      <div className="mx-auto max-w-6xl px-6 py-16 space-y-20">
        <Reveal from="up">
          <div className="pt-6">
            <div className="flex items-center justify-center gap-6 mb-2">
              <span className="hidden md:block h-1 w-16 bg-yellow-300 rounded-full" />
              <h1
                className="
                  font-extrabold tracking-tight text-blue-600
                  text-[clamp(48px,10vw,140px)]
                  leading-none text-center
                "
              >
                SelfStar.AI
              </h1>
              <span className="hidden md:block h-1 w-16 bg-yellow-300 rounded-full" />
            </div>

            <p className="text-center mt-4 text-lg md:text-2xl font-semibold text-slate-900">
              자신만의 인플루언서를 생성하여 <span className="underline decoration-blue-400">활동해보세요!</span>
            </p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <Reveal from="left">
            <img src={hero} alt="hero" className="w-full rounded-2xl shadow border object-cover" />
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
            <img src={step2 || step1} alt="step2" className="w-full rounded-2xl shadow border" />
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <Reveal from="left">
            <img src={step3 || step1} alt="step3" className="w-full rounded-2xl shadow border" />
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
