import React, { useState } from "react";

/**
 * AuthScreen.jsx
 * 헤더/푸터를 건드리지 않고, 본문(OAuth 로그인/회원가입 화면)만 렌더링하는 컴포넌트입니다.
 * 스타일은 .auth-scope 아래에만 적용되어 기존 전역 스타일을 오염시키지 않습니다.
 */
export default function AuthScreen() {
  const [tab, setTab] = useState("login"); // 'login' | 'signup'

  const styles = `
    /* 스코프: 이 안의 규칙은 .auth-scope 하위에만 적용됨 */
    .auth-scope{ --bg:#EAF5FE; --panel:#ffffff; --muted:#5b6780; --text:#0b1220; --primary:#2563EB; --ring:0 0 0 3px rgba(37,99,235,.25); --radius:16px; --shadow:0 10px 30px rgba(17,24,39,.08); }

    .auth-scope .wrap{max-width:1100px; margin:0 auto; padding:24px}

    .auth-scope .auth-wrap{display:grid; grid-template-columns: 1.1fr .9fr; gap:28px; margin-top:24px}
    @media (max-width: 968px){ .auth-scope .auth-wrap{grid-template-columns:1fr} }

    .auth-scope .showcase{ min-height:560px; border-radius:var(--radius); padding:28px; position:relative; overflow:hidden; background:linear-gradient(180deg,#ffffff,#f6faff); border:1px solid rgba(37,99,235,.14); box-shadow:var(--shadow); }
    .auth-scope .showcase h1{font-size:40px; line-height:1.1; margin:10px 0 6px; color:var(--text)}
    .auth-scope .showcase p{color:var(--muted); margin:0}
    .auth-scope .badge{display:inline-flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px; font-size:12px; color:#0b1220; background:rgba(37,99,235,.12); border:1px solid rgba(37,99,235,.25)}
    .auth-scope .mock{position:absolute; right:-40px; bottom:-40px; width:520px; height:520px; border-radius:40px; transform:rotate(8deg); background: radial-gradient(120px 120px at 65% 25%, rgba(37,99,235,.20), transparent), linear-gradient(135deg, rgba(96,165,250,.30), rgba(59,130,246,.20)); filter: blur(4px); opacity:.9; border:1px solid rgba(37,99,235,.15); }

    .auth-scope .panel{border-radius:var(--radius); background:linear-gradient(180deg,#ffffff,#fbfdff); border:1px solid rgba(37,99,235,.14); box-shadow:var(--shadow); overflow:hidden}
    .auth-scope .tabs{display:flex; background:#f1f7ff; padding:6px; gap:6px}
    .auth-scope .tab{flex:1 1 0; text-align:center; padding:12px 14px; border-radius:12px; cursor:pointer; user-select:none; color:var(--muted); font-weight:700}
    .auth-scope .tab[aria-selected="true"]{background:#ffffff; color:var(--text); box-shadow: inset 0 0 0 1px rgba(37,99,235,.12)}

    .auth-scope .panel-inner{padding:22px}
    .auth-scope .title{font-size:24px; font-weight:800; margin:2px 0 18px; color:var(--text)}

    .auth-scope .stack{display:grid; gap:12px}
    .auth-scope .divider{display:flex; align-items:center; gap:12px; margin:14px 0; color:var(--muted); font-size:13px}
    .auth-scope .divider:before, .auth-scope .divider:after{content:""; height:1px; flex:1; background:rgba(37,99,235,.18)}

    .auth-scope .btn{display:flex; align-items:center; gap:12px; width:100%; border:1px solid rgba(37,99,235,.18); background:#ffffff; padding:12px 14px; border-radius:12px; color:var(--text); font-weight:700; text-decoration:none}
    .auth-scope .btn:hover{box-shadow:var(--ring)}
    .auth-scope .btn:focus-visible{outline:none; box-shadow:var(--ring)}
    .auth-scope .btn.kakao{background:#fee500; color:#181600; border-color:#e8d700}
    .auth-scope .btn.google{background:#ffffff; color:#202124; border-color:#dadce0}
    .auth-scope .btn.naver{background:#03C75A; color:#ffffff; border-color:#02b351}
    .auth-scope .btn .pill{margin-left:auto; font-size:12px; padding:6px 10px; border-radius:999px; background:rgba(37,99,235,.12); color:#0b1220}

    .auth-scope .note{color:var(--muted); font-size:12px; line-height:1.5}
    .auth-scope .note a{color:#0b1220}

    .auth-scope .ic{width:20px; height:20px; display:inline-block}
  `;

  const handleAuth = (provider) => (e) => {
    e.preventDefault();
    // 실제 OAuth 시작 엔드포인트로 이동
    // 현재 탭 상태를 intent로 저장하여 콜백 후 홈('/')에 도착해도 의도에 따라 클라이언트에서 보정
  try { localStorage.setItem("oauth_intent", tab); } catch { /* ignore */ }
  const apiBase = (import.meta?.env?.VITE_API_BASE ?? "").replace(/\/$/, "");
    if (provider === "kakao") {
      window.location.href = apiBase ? `${apiBase}/auth/kakao` : "/auth/kakao"; // alias to /auth/kakao/login
      return;
    }
    if (provider === "google") {
      window.location.href = apiBase ? `${apiBase}/auth/google` : "/auth/google"; // alias to /auth/google/login
      return;
    }
    if (provider === "naver") {
      window.location.href = apiBase ? `${apiBase}/auth/naver` : "/auth/naver"; // alias to /auth/naver/login
      return;
    }
  };

  const TabButton = ({ id, label, selected, onClick }) => (
    <div
      id={`tab-${id}`}
      role="tab"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className="tab"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {label}
    </div>
  );

  return (
    <section className="auth-scope">
      <style>{styles}</style>
      <div className="wrap">
        <div className="auth-wrap" aria-label="OAuth 인증">
          {/* 왼쪽 쇼케이스 */}
          <aside className="showcase" aria-hidden="false">
            <span className="badge">간편 로그인 및 회원가입</span>
            <h1>
              {tab === "signup" ? "원클릭 회원가입으로" : "원클릭 로그인으로"}
              <br />바로 시작하세요
            </h1>
            <p>
              카카오 · 구글 · 네이버 중 편한 계정으로 로그인/회원가입하고,
              <br />SelfStar의 모든 기능을 즉시 이용하세요.
            </p>
            <div className="mock" aria-hidden="true" />
          </aside>

          {/* 오른쪽 패널 */}
          <div className="panel" role="region" aria-labelledby="tab-login">
            <div className="tabs" role="tablist">
              <TabButton id="login" label="로그인" selected={tab === "login"} onClick={() => setTab("login")} />
              <TabButton id="signup" label="회원가입" selected={tab === "signup"} onClick={() => setTab("signup")} />
            </div>

            <div className="panel-inner">
              {/* LOGIN */}
              <div id="panel-login" role="tabpanel" aria-labelledby="tab-login" hidden={tab !== "login"}>
                <h2 className="title">소셜 계정으로 로그인</h2>
                <div className="stack">
                  <a className="btn kakao" href="#" aria-label="카카오로 로그인" onClick={handleAuth("kakao")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.48 3 2 6.58 2 10.98c0 2.98 2.22 5.6 5.49 6.86l-.76 3.9a.5.5 0 00.75.54l4.14-2.6c.12.01.24.02.37.02 5.52 0 10-3.58 10-7.98S17.52 3 12 3z" fill="#181600"/></svg>
                    카카오로 계속하기
                  </a>
                  <a className="btn google" href="#" aria-label="구글로 로그인" onClick={handleAuth("google")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.35 11.1H12v2.9h5.35c-.23 1.48-1.8 4.34-5.35 4.34a6.18 6.18 0 110-12.36c1.76 0 3.32.66 4.55 1.75l2.05-2.02A9.76 9.76 0 0012 2.5C6.75 2.5 2.5 6.75 2.5 12S6.75 21.5 12 21.5c5.77 0 9.5-4.05 9.5-9.76 0-.67-.08-1.19-.15-1.64z" fill="currentColor"/></svg>
                    Google로 계속하기
                  </a>
                  <a className="btn naver" href="#" aria-label="네이버로 로그인" onClick={handleAuth("naver")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h5.7l3.3 5.1V4H19v16h-5.7L10 14.1V20H5z" fill="#ffffff"/></svg>
                    네이버로 계속하기
                  </a>
                </div>

                <div className="divider">또는</div>
                <p className="note">회사/학교 계정 연동은 관리자에게 문의하세요. 로그인하면 서비스 이용약관과 개인정보처리방침에 동의한 것으로 간주됩니다. <a href="#">보기</a></p>
              </div>

              {/* SIGNUP */}
              <div id="panel-signup" role="tabpanel" aria-labelledby="tab-signup" hidden={tab !== "signup"}>
                <h2 className="title">간편 회원가입</h2>
                <div className="stack">
                  <a className="btn kakao" href="#" aria-label="카카오로 회원가입" onClick={handleAuth("kakao")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.48 3 2 6.58 2 10.98c0 2.98 2.22 5.6 5.49 6.86l-.76 3.9a.5.5 0 00.75.54l4.14-2.6c.12.01.24.02.37.02 5.52 0 10-3.58 10-7.98S17.52 3 12 3z" fill="#181600"/></svg>
                    카카오계정으로 회원가입
                  </a>
                  <a className="btn google" href="#" aria-label="구글로 회원가입" onClick={handleAuth("google")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.35 11.1H12v2.9h5.35c-.23 1.48-1.8 4.34-5.35 4.34a6.18 6.18 0 110-12.36c1.76 0 3.32.66 4.55 1.75l2.05-2.02A9.76 9.76 0 0012 2.5C6.75 2.5 2.5 6.75 2.5 12S6.75 21.5 12 21.5c5.77 0 9.5-4.05 9.5-9.76 0-.67-.08-1.19-.15-1.64z" fill="currentColor"/></svg>
                    Google 계정으로 회원가입
                  </a>
                  <a className="btn naver" href="#" aria-label="네이버로 회원가입" onClick={handleAuth("naver")}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h5.7l3.3 5.1V4H19v16h-5.7L10 14.1V20H5z" fill="#ffffff"/></svg>
                    네이버계정으로 회원가입
                  </a>
                </div>

                <div className="divider">가입 안내</div>
                <p className="note">가입 시 닉네임과 프로필 이미지는 이후 마이페이지에서 변경할 수 있어요. 가입을 누르면 이용약관 및 개인정보처리방침에 동의하게 됩니다. <a href="#">자세히</a></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
