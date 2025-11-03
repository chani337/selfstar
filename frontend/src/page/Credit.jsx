import React, { useEffect, useState } from "react";
import { API_BASE } from "@/api/client";

// Page-specific CSS + simple entrance animation
const pageCss = `
  .credit-hero { text-align:center; }
  .credit-hero .title { font-weight:900; line-height:1; }
  .credit-hero .subtitle { color: #64748b; margin-top:8px; }

  @keyframes fadeSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
  .fade-slide-up { opacity:0; transform:translateY(12px); animation: fadeSlideUp 480ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--delay, 0ms); }

  /* Success animations */
  @keyframes successPop { 0%{ transform:scale(.6); opacity:0 } 60%{ transform:scale(1.05); opacity:1 } 100%{ transform:scale(1); opacity:1 } }
  .success-check {
    width: 80px; height: 80px; border-radius: 9999px;
    background: radial-gradient(120% 120% at 30% 20%, #34d399 0%, #10b981 60%, #059669 100%);
    color: white; display: grid; place-items: center;
    box-shadow: 0 12px 30px rgba(16,185,129,.35), inset 0 0 30px rgba(255,255,255,.28);
    animation: successPop 600ms cubic-bezier(.2,.8,.2,1) both;
  }
  .success-text {
    background: linear-gradient(90deg, #0ea5e9, #22c55e, #8b5cf6);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .shine { position: relative; }
  .shine:after {
    content: ""; position: absolute; inset: 0; border-radius: 9999px;
    background: linear-gradient(120deg, transparent, rgba(255,255,255,.35), transparent);
    transform: translateX(-120%);
    animation: shineMove 1600ms cubic-bezier(.2,.8,.2,1) 400ms both;
  }
  @keyframes shineMove { to { transform: translateX(120%); } }

  /* Confetti */
  .confetti-wrap { pointer-events:none; position: absolute; inset: 0; overflow: hidden; }
  .confetti { position:absolute; top:-12px; left:50%; width:8px; height:14px; border-radius:3px; opacity:0; will-change: transform, opacity; }
  @keyframes confettiFall {
    0% { transform: translate(calc(var(--x, 0) * 1px), -12px) rotate(0deg); opacity:0; }
    10% { opacity:1; }
    100% { transform: translate(calc(var(--x, 0) * 1px), 110%) rotate(720deg); opacity:0; }
  }
`;

/* ------------------ Icons ------------------ */
function IconBubble({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8c0-3 3-5 7-5s7 2 7 5-3 5-7 5c-.7 0-1.4-.07-2-.21L3 18l1-4.5C3.4 12.2 3 10.2 3 8z" fill="currentColor" opacity="0.12" />
      <path d="M7.5 10.5c-1.2 0-2.2-.9-2.2-2s1-2 2.2-2 2.2.9 2.2 2-1 2-2.2 2z" fill="currentColor" />
    </svg>
  );
}

function IconSparkle({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l1.8 3.6L17 7l-3.2 1.4L12 12l-1.8-3.6L7 7l3.2-1.4L12 2z" fill="currentColor" opacity="0.95" />
      <path d="M5 14l1 2 2 .6-2 .6-1 2-1-2-2-.6 2-.6 1-2z" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function IconTag({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 12l10 10 10-10-9-9L2 12z" fill="currentColor" opacity="0.08" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 10.5l3 3 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------ PlanCard ------------------ */
function PlanCard({
  Icon,
  title,
  subtitle,
  price,
  desc,
  features = [],
  featured,
  buttonText,
  buttonPrimary,
  footerNote,
  delay = 0,
  onClick,
}) {
  const isPro = Boolean(featured);
  const isBusiness = title && title.includes("비즈니스");

  const outerClass =
    isBusiness
      ? "bg-white border border-slate-200 text-slate-900 shadow-md rounded-3xl"
      : "bg-white border border-slate-100 text-slate-900 shadow-md rounded-3xl";

  const hoverFree =
    "hover:bg-linear-to-r hover:from-emerald-400 hover:to-emerald-600 hover:shadow-2xl hover:text-white hover:scale-105 hover:-translate-y-1";
  const hoverPro =
    "hover:bg-linear-to-r hover:from-sky-500 hover:to-violet-600 hover:shadow-2xl hover:text-white hover:scale-105 hover:-translate-y-1";
  const hoverBiz =
    "hover:bg-linear-to-r hover:from-indigo-400 hover:to-indigo-600 hover:shadow-2xl hover:text-white hover:scale-105 hover:-translate-y-1";

  const finalOuter = isPro ? `${outerClass} ${hoverPro}` : isBusiness ? `${outerClass} ${hoverBiz}` : `${outerClass} ${hoverFree}`;

  const btnClass = buttonPrimary
    ? "bg-sky-600 text-white font-semibold shadow hover:brightness-95"
    : "border border-slate-200 text-slate-900 hover:bg-slate-50";

  const featureTextClass = "text-slate-700 group-hover:text-white/95";

  return (
    <article
      className={`relative rounded-2xl overflow-hidden group ${finalOuter} transition-all duration-300 ease-out h-full flex flex-col fade-slide-up`}
      style={{ ['--delay']: `${delay}ms` }}
    >
      <div className="relative p-8 flex-1 flex flex-col">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg grid place-items-center bg-slate-100 text-sky-600 group-hover:bg-white/10 group-hover:text-white">
            {Icon ? <Icon className="w-6 h-6" /> : <span className="text-xl">{title?.[0]}</span>}
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 group-hover:text-white">{title}</h3>
            <p className="text-sm text-slate-500 group-hover:text-white/90">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl px-4 py-4 flex items-baseline justify-between bg-white/10">
          <div>
            <div className="text-3xl font-extrabold text-sky-600 group-hover:text-white">{price}</div>
            {String(price) && !/상담|문의/i.test(String(price)) ? (
              <div className="text-xs text-slate-500 group-hover:text-white/90">/월 · 부가세 별도</div>
            ) : null}
          </div>
          <div className="text-right max-w-[40%]">
            <div className="text-sm text-slate-500 group-hover:text-white/90 wrap-break-word">{desc}</div>
          </div>
        </div>

        <div className="mt-5 flex-1 overflow-hidden">
          <ul className="grid grid-cols-1 sm:grid-cols-1 gap-3 h-full overflow-auto pr-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`${isBusiness ? "bg-indigo-50 text-indigo-700" : "bg-emerald-100 text-emerald-700"} mt-1 w-7 h-7 rounded-full flex items-center justify-center group-hover:bg-white/20 group-hover:text-white`}>
                  <CheckIcon className="w-3 h-3" />
                </span>
                <div className={`${featureTextClass} text-sm wrap-break-word`}>{f}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <button onClick={onClick} className={`w-full ${btnClass} py-3 rounded-full focus:outline-none focus:ring-4 focus:ring-sky-300`}>
            {buttonText}
          </button>
          {footerNote && <p className="mt-3 text-center text-xs text-slate-400">{footerNote}</p>}
        </div>
      </div>
    </article>
  );
}

/* ------------------ Main Page ------------------ */
export default function CreditPlans() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [plan, setPlan] = useState("standard"); // default to free/standard
  const [offlineSuccess, setOfflineSuccess] = useState(false);

  const normalizePlan = (p) => {
    const v = String(p || '').toLowerCase();
    if (v === 'basic' || v === 'free' || v === 'standard') return 'standard';
    if (v === 'biz') return 'business';
    if (v === 'business' || v === 'pro') return v;
    return 'standard';
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/credits/me`, { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setPlan(normalizePlan(j?.plan));
      } catch {}
    })();
    const handler = (e) => {
      const p = e?.detail?.plan;
      if (p) setPlan(normalizePlan(p));
    };
    window.addEventListener('user-credit-changed', handler);
    return () => { alive = false; window.removeEventListener('user-credit-changed', handler); };
  }, []);

  const openProCheckout = () => {
    setError("");
    setSuccess(false);
    setCheckoutOpen(true);
  };

  const fakePayAndUpgrade = async () => {
    setPaying(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/credits/upgrade`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        // 임시 플로우: 서버가 없거나 라우트가 404면 프론트에서 성공으로 처리
        if (r.status === 404) {
          setSuccess(true);
          setPlan('pro');
          setOfflineSuccess(true);
          try { window.dispatchEvent(new CustomEvent('user-credit-changed', { detail: { plan: 'pro' } })); } catch {}
          return;
        }
        throw new Error(j?.detail || `HTTP ${r.status}`);
      }
      setSuccess(true);
      setPlan('pro');
      setOfflineSuccess(false);
      try { window.dispatchEvent(new CustomEvent('user-credit-changed', { detail: { plan: 'pro' } })); } catch {}
      // 성공 직후 서버 상태 검증 (선택)
      try { const vr = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' }); if (!vr.ok) setOfflineSuccess(true); } catch { setOfflineSuccess(true); }
    } catch (e) {
      // 네트워크/서버 불가 환경에서도 즉시 업그레이드 UX 제공
      const msg = e?.message || String(e || '');
      if (/404/.test(msg) || /Failed to fetch|NetworkError|TypeError/i.test(msg)) {
        setSuccess(true);
        setPlan('pro');
        setOfflineSuccess(true);
        try { window.dispatchEvent(new CustomEvent('user-credit-changed', { detail: { plan: 'pro' } })); } catch {}
      } else {
        setError(msg);
      }
    } finally {
      setPaying(false);
    }
  };

  const switchToFree = async () => {
    if (!window.confirm('무료 플랜으로 전환할까요? 일부 기능이 제한될 수 있어요.')) return;
    setPaying(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/credits/upgrade`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'standard' })
      });
      if (!r.ok && r.status !== 404) {
        const j = await r.json().catch(()=>null);
        throw new Error(j?.detail || `HTTP ${r.status}`);
      }
      setPlan('standard');
      try { window.dispatchEvent(new CustomEvent('user-credit-changed', { detail: { plan: 'standard' } })); } catch {}
      alert('무료 플랜으로 전환되었습니다.');
    } catch (e) {
      const msg = e?.message || String(e || '');
      if (/404/.test(msg) || /Failed to fetch|NetworkError|TypeError/i.test(msg)) {
        setPlan('standard');
        try { window.dispatchEvent(new CustomEvent('user-credit-changed', { detail: { plan: 'standard' } })); } catch {}
        alert('무료 플랜으로 전환되었습니다.');
      } else {
        setError(msg);
      }
    } finally { setPaying(false); }
  };

  return (
    <div className="w-full min-h-screen text-slate-900 flex flex-col bg-[#eaf6ff] relative">
      <style>{pageCss}</style>
      <main className="w-full py-8">
        {/* Decorative background blobs */}
  <div className="pointer-events-none absolute -left-20 -top-20 w-72 h-72 bg-linear-to-r from-blue-200/40 to-indigo-200/30 rounded-full blur-3xl opacity-70" />
  <div className="pointer-events-none absolute right-6 top-24 w-64 h-64 bg-linear-to-r from-rose-100/30 to-indigo-100/20 rounded-full blur-3xl opacity-60" />

        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <header className="credit-hero text-center mb-6">
            <h1 className="title text-4xl md:text-5xl lg:text-6xl tracking-tight bg-linear-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
              SelfStar.AI 크레딧/요금제
            </h1>
            <p className="subtitle mt-3 text-sm max-w-2xl mx-auto">
              AI 이미지 생성과 운영 자동화를 손쉽게 시작하세요.
            </p>
          </header>

          <section aria-label="요금제 목록" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 items-start">
            <PlanCard
              Icon={IconBubble}
              title="무료"
              subtitle="개인 테스트용"
              price="₩0"
              desc="가볍게 시작해 보세요"
              features={[
                "하루 5장 이미지 생성 (AI 이미지 API)",
                "생성 이미지에 워터마크 포함",
                "페르소나 최대 2개",
                "간단 템플릿, 예약 게시 5건/월",
                "Instagram 수동 업로드 지원",
              ]}
                buttonText={plan === 'standard' ? '이용 중' : '무료로 전환'}
              delay={80}
              footerNote="카드 정보 불필요"
              onClick={plan === 'standard' ? undefined : switchToFree}
            />

            <PlanCard
              Icon={IconSparkle}
              title="프로"
              subtitle="크리에이터 · 소상공인 추천"
              price="₩15,900"
              desc="가장 많은 사용자에게 추천되는 요금제"
              featured
              features={[
                "높은 생성량, 빠른 처리 우선순위",
                "워터마크 제거, 상업적 사용 가능",
                "페르소나 최대 4개, 브랜드 키트",
                "예약 게시 무제한, Instagram 자동 업로드",
                "API 액세스",
              ]}
              buttonText={plan === 'pro' ? '이용 중' : '프로로 업그레이드'}
              delay={160}
              buttonPrimary
              onClick={plan === 'pro' ? undefined : openProCheckout}
            />

            <PlanCard
              Icon={IconTag}
              title="비즈니스"
              subtitle="팀 · 브랜드 운영"
              desc="대량 운영과 협업에 최적화된 옵션"
              features={[
                "팀 시트 3석 포함, 권한 관리",
                "무제한 생성량, 전용 처리 큐",
                "댓글 알림/응답 자동화, 운영 대시보드",
                "전용 API/웹훅 우선도, SLA 옵션",
                "전담 온보딩, 캠페인 컨설팅",
              ]}
              price="상담 요청"
              buttonText="상담 요청"
              delay={240}
              footerNote="필요 시 맞춤 견적 제공"
            />
          </section>
        </div>
      </main>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setCheckoutOpen(false)}>
          <div className="w-[min(560px,96vw)] rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_rgba(2,6,23,0.28)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between border-b">
              <div className="font-semibold">프로 플랜 결제</div>
              <button className="btn" onClick={() => setCheckoutOpen(false)}>닫기</button>
            </div>
            <div className="p-5 space-y-4">
              {!success ? (
                <>
                  <div className="text-sm text-slate-600">아래 정보는 예시일 뿐이며 실제로 결제되지 않습니다.</div>
                  <div className="grid gap-3">
                    <label className="text-sm">
                      카드 소유자명
                      <input type="text" className="mt-1 w-full rounded-lg border p-2" placeholder="홍길동" defaultValue="홍길동" />
                    </label>
                    <label className="text-sm">
                      카드 번호
                      <input type="text" className="mt-1 w-full rounded-lg border p-2" placeholder="1234 5678 9012 3456" defaultValue="4111 1111 1111 1111" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">
                        유효기간 (MM/YY)
                        <input type="text" className="mt-1 w-full rounded-lg border p-2" placeholder="12/30" defaultValue="12/30" />
                      </label>
                      <label className="text-sm">
                        CVC
                        <input type="password" className="mt-1 w-full rounded-lg border p-2" placeholder="***" defaultValue="123" />
                      </label>
                    </div>
                  </div>
                  {error && <div className="text-sm text-red-600">{error}</div>}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button className="btn light" onClick={() => setCheckoutOpen(false)}>취소</button>
                    <button className="btn primary" disabled={paying} onClick={fakePayAndUpgrade}>{paying ? '처리 중…' : '결제하기'}</button>
                  </div>
                </>
              ) : (
                <div className="relative text-center py-6">
                  {/* Confetti */}
                  <div className="confetti-wrap">
                    {Array.from({ length: 28 }).map((_, i) => (
                      <span
                        key={i}
                        className="confetti"
                        style={{
                          ['--x']: `${(i - 14) * 18}`,
                          ['--delay']: `${(i % 7) * 90}ms`,
                          ['--dur']: `${2 + (i % 5) * 0.35}s`,
                          background: `hsl(${(i * 37) % 360} 90% 60%)`,
                          animation: 'confettiFall var(--dur) ease-in forwards',
                          animationDelay: 'var(--delay)'
                        }}
                      />
                    ))}
                  </div>
                  <div className="mx-auto success-check">
                    {/* check icon */}
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div className="mt-4 text-2xl font-extrabold success-text">프로로 업그레이드 되었습니다.</div>
                  <div className="text-sm text-slate-600 mt-1">마이페이지 상단의 등급이 프로로 변경됩니다.</div>
                  {offlineSuccess && (
                    <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 inline-block px-2 py-1 rounded">
                      현재 서버 연결이 없어 DB 저장이 보류 상태입니다. 서버가 켜져 있을 때 다시 시도하면 저장됩니다.
                    </div>
                  )}
                  <button className="btn primary mt-5 shine" onClick={() => setCheckoutOpen(false)}>확인</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
