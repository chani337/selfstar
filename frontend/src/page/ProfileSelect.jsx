import React, { useMemo, useState, useEffect } from "react";
import { API_BASE } from "@/api/client";
import { useNavigate, Link } from "react-router-dom";

/**
 * 넷플릭스 스타일 프로필 선택 (초기 프로필 0개 / 모달 생성)
 *
 * Props (optional):
 * - maxSlots?: number                        // 기본 4
 */
export default function ProfileSelect({ maxSlots = 4, onProfileChosen, onAddProfileClick, compact = false, refreshKey, autoPickNum }) {
  const navigate = useNavigate();
  // 내부 모델: { type: "profile" | "add" | "locked", name?: string, img?: string, num?: number }
  const [tiles, setTiles] = useState(() => Array.from({ length: maxSlots }, (_, i) => (i === 0 ? { type: "add" } : { type: "locked" })));
  const [userCredit, setUserCredit] = useState(null);
  const [personas, setPersonas] = useState([]); // [{ num, img, name }]
  // 외부(새 프로필 생성 후 돌아오기 등)에서 눈에 띄게 새로고침하도록 bump 키 추가
  const [bump, setBump] = useState(0);
  // credit가 'pro'이면 모든 슬롯 잠금 해제
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setUserCredit(data?.user?.credit || null);
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [refreshKey, bump]);

  // 내 페르소나 목록 불러오기 (user_persona_num 순)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/personas/me`, { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        // 낮은 num 먼저(오래된 → 새로운). num이 클수록 뒤로 가도록 오름차순 정렬
        items.sort((a, b) => (a.num || 0) - (b.num || 0));
        setPersonas(items);
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [refreshKey, bump]);

  // 창 포커스 복귀나 persona-created 이벤트 시 목록을 새로고침
  useEffect(() => {
    const onFocus = () => setBump((v) => v + 1);
    const onPersonaCreated = () => setBump((v) => v + 1);
    window.addEventListener("focus", onFocus);
    window.addEventListener("persona-created", onPersonaCreated);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("persona-created", onPersonaCreated);
    };
  }, []);

  // personas + credit -> tiles 재구성
  useEffect(() => {
    const used = personas.slice(0, maxSlots).map(p => ({ type: "profile", name: p.name, img: p.img, num: p.num }));
    const empty = Math.max(0, maxSlots - used.length);
    const allowedAdds = userCredit === "pro" ? empty : Math.min(1, empty);
    const adds = Array.from({ length: allowedAdds }, () => ({ type: "add" }));
    const locks = Array.from({ length: empty - allowedAdds }, () => ({ type: "locked" }));
    const nextTiles = used.concat(adds, locks).slice(0, maxSlots);
    setTiles(nextTiles);
  }, [personas, userCredit, maxSlots]);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const canStart = useMemo(() => selectedIndex !== null && tiles[selectedIndex] && tiles[selectedIndex].type === "profile", [selectedIndex, tiles]);

  const initialFrom = (name) => {
    const t = (name || "").trim();
    return t ? t[0].toUpperCase() : "+";
  };

  // 프로필 생성 모달은 사용하지 않음 (add 클릭 시 바로 이동)

  const selectTile = (idx) => {
    const t = tiles[idx];
    if (t.type === "add") {
      // 프로필 추가: 콜백 우선, 없으면 기존 네비게이션
      if (typeof onAddProfileClick === "function") {
        onAddProfileClick();
      } else {
        navigate("/imgcreate", { state: { profileName: null, intent: "create-profile" } });
      }
    } else if (t.type === "profile") {
      setSelectedIndex(idx);
    } else {
      // locked: no-op
    }
  };

  const handleStart = () => {
    if (!canStart) return;
    // 선택된 프로필 확정: 콜백 우선, 없으면 기존 네비게이션
    const tile = tiles[selectedIndex];
    const payload = { name: tile.name, num: tile.num, img: tile.img };
    if (typeof onProfileChosen === "function") {
      onProfileChosen(payload);
    } else {
      navigate("/imgcreate", { state: { profileName: tile.name } });
    }
  };

  // If autoPickNum is provided and exists in personas, auto-select and confirm
  useEffect(() => {
    if (autoPickNum == null) return;
    // find index in current tiles
    const idx = tiles.findIndex(t => t.type === "profile" && Number(t.num) === Number(autoPickNum));
    if (idx >= 0) {
      setSelectedIndex(idx);
      // slight delay to ensure UI ready, then auto-start
      const tm = setTimeout(() => {
        const tile = tiles[idx];
        if (tile && tile.type === "profile") {
          const payload = { name: tile.name, num: tile.num, img: tile.img };
          if (typeof onProfileChosen === "function") onProfileChosen(payload);
        }
      }, 50);
      return () => clearTimeout(tm);
    }
  }, [autoPickNum, tiles, onProfileChosen]);

  return (
    <div className={`page ${compact ? "is-compact" : ""}`}>
      <StyleTag />
      <div className="wrap" role="application" aria-label="프로필 선택">
        <Link to="/" className="brand-link" aria-label="SelfStar.AI 홈으로">
          <span className="brand-blue">SelfStar</span>
          <span className="brand-dot">.AI</span>
        </Link>
        <h1>인플루언서 캐릭터를 골라주세요.</h1>
        <p className="sub">
          인플루언서 캐릭터가 없으시다면 <b>+</b> 버튼을 눌러 구축해보세요.
        </p>

        <div className="grid" role="listbox" aria-label="프로필 목록">
          {tiles.map((t, idx) => {
            const isSelected = selectedIndex === idx;
            if (t.type === "locked") {
              return (
                <button
                  key={idx}
                  className="tile locked"
                  type="button"
                  role="option"
                  aria-checked="false"
                  aria-disabled="true"
                  disabled
                  style={{ "--i": idx }}
                >
                  <div className="tile-inner">
                    <div className="lock" aria-hidden="true">{userCredit === "pro" ? "" : "🔒"}</div>
                    <div className="label">잠금</div>
                  </div>
                </button>
              );
            }
            return (
              <button
                key={idx}
                className={`tile ${isSelected ? "is-selected" : ""}`}
                type="button"
                role="option"
                aria-checked={isSelected}
                style={{ "--i": idx }}
                onClick={() => selectTile(idx)}
              >
                <div className="tile-inner">
                  {t.type === "profile" ? (
                    <>
                      {t.img ? (
                        <div className="pfpimg-wrap" aria-hidden="true">
                          <img src={t.img} alt="" className="pfp-img" />
                        </div>
                      ) : (
                        <div className="pfp" aria-hidden="true">{initialFrom(t.name)}</div>
                      )}
                      <div className="label">{t.name}</div>
                    </>
                  ) : (
                    <>
                      <div className="plus" aria-hidden="true">+</div>
                      <div className="label">프로필 추가</div>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => {
            try {
              if (typeof window !== 'undefined') {
                // 신호를 올려(App 레벨에서 전역 모달 오픈)
                window.dispatchEvent(new CustomEvent('open-manage-profiles'));
              }
            } catch {}
          }}>
            프로필 관리
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!canStart}
            onClick={handleStart}
          >
            시작하기
          </button>
        </div>
      </div>

      {/* 프로필 생성 모달 제거됨 */}
    </div>
  );
}

/* -------------------- 스타일 -------------------- */
function StyleTag() {
  return (
    <style>{`
  :root{
    --bg-0:#ffffff; --bg-1:#f6fbff; --bg-2:#eff7ff;
    --ink:#0f1d2b; --muted:#5c6f83; --line:#d9e9ff;
    --cta:#2d6cdf; --cta-2:#5ea3ff;
    --header-h:64px;
  }
  *{box-sizing:border-box}
  html,body,#root{height:100%}
  .page{
    display:flex; align-items:center; justify-content:center;
    padding:clamp(16px,3vw,32px);
    color:var(--ink);
    font:16px/1.5 "Pretendard",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:
      radial-gradient(1400px 900px at 50% -30%, var(--bg-2) 0%, transparent 55%),
      linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 60%, #f9fbff 100%);
  }
  .wrap{ width:min(1160px,94vw); text-align:center; }
  .wrap h1{ margin-top:6px }
  .wrap{ width:min(1160px,94vw); text-align:center; }
  .brand-link{ display:inline-flex; align-items:center; justify-content:center; gap:3px; margin:0 auto 16px; font-weight:800; letter-spacing:-.2px; font-size:clamp(18px, 2.2vw, 22px); padding:8px 12px; border-radius:14px; border:1px solid #e4eefc; background:linear-gradient(180deg,#ffffff,#f6fbff); color:#0f1d2b; box-shadow:0 8px 20px rgba(45,108,223,.10), inset 0 1px 0 rgba(255,255,255,.9); text-decoration:none }
  .brand-blue{ color:#2563eb }
  .brand-dot{ color:#0f1d2b }
  h1{ margin:0 0 10px; font-weight:900; letter-spacing:-.4px; font-size:clamp(22px,3.4vw,36px); }
  .sub{ color:var(--muted); margin:0 0 26px; font-size:14px }

  .grid{ display:grid; gap:18px; grid-template-columns: repeat(4, 240px); justify-content:center }
  @media (max-width:980px){ .grid{ grid-template-columns: repeat(3,1fr); } }
  @media (max-width:680px){ .grid{ grid-template-columns: repeat(2,1fr); } }

  /* height-aware compaction so everything stays centered and visible */
  @media (max-height: 900px){
    .page{ padding:clamp(12px,2.5vw,24px); }
    h1{ margin-bottom:8px; font-size:clamp(20px,3vw,30px); }
    .sub{ margin-bottom:18px; font-size:13px }
    .grid{ gap:16px }
    .tile{ aspect-ratio: 3/4 }
    .pfp{ width:76px; height:76px; border-radius:20px }
    .plus{ width:60px; height:60px; border-radius:16px }
    .label{ bottom:14px }
    .actions{ margin-top:16px }
    .btn{ height:42px }
  }
  @media (max-height: 760px){
    .page{ padding:clamp(10px,2vw,18px); }
    h1{ margin-bottom:6px; font-size:clamp(18px,2.6vw,26px); }
    .sub{ margin-bottom:14px; font-size:12.5px }
    .grid{ gap:12px }
    .tile{ aspect-ratio: 1/1 }
    .pfp{ width:64px; height:64px; border-radius:18px; font-size:28px }
    .plus{ width:52px; height:52px; border-radius:14px; font-size:32px }
    .label{ bottom:12px }
    .btn{ height:40px; padding:0 16px }
  }

  /* ultra-light 카드 */
  .tile{
    position:relative; border-radius:18px; overflow:hidden;
    background: linear-gradient(180deg,#F7FBFF 0%, #EFF6FF 40%, #EAF2FF 100%);
    border:1px solid #E3EEFF;
    aspect-ratio: 4/5; cursor:pointer; user-select:none; transform:translateZ(0);
    box-shadow: 0 10px 24px rgba(45,108,223,.10), inset 0 1px 0 rgba(255,255,255,.85);
    transition: transform .14s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, opacity .25s ease;
    outline:none;
    /* entrance */
    opacity:0; transform: translateY(8px) scale(.985);
    animation: fadeUp .45s ease forwards; animation-delay: calc(var(--i, 0) * 60ms);
  }
  .tile:hover, .tile:focus-visible{
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 18px 36px rgba(45,108,223,.16), 0 2px 10px rgba(15,29,43,.06);
    border-color:#D6E7FF;
  }
  .tile:active{ transform: translateY(0) scale(.995); }
  .tile.locked{ filter:saturate(.6) grayscale(.1); }
  .tile.locked:hover, .tile.locked:focus-visible{ transform:none; box-shadow: 0 10px 24px rgba(45,108,223,.10), inset 0 1px 0 rgba(255,255,255,.85); border-color:#E3EEFF }
  .tile.locked::before, .tile.locked::after{ display:none }
  .tile.is-selected{
    /* 단순 파란 테두리 링으로 선택만 표시 (레이아웃 변화 없음) */
    transform:none !important;
    box-shadow: 0 0 0 3px #3b82f6 inset, 0 16px 34px rgba(45,108,223,.16);
    border-color:#bfdbfe;
  }
  .tile.is-selected:hover, .tile.is-selected:focus-visible{ transform:none; box-shadow: 0 0 0 3px #3b82f6 inset, 0 18px 36px rgba(45,108,223,.2) }
  /* glow ring & shine */
  .tile::after{
    content:""; position:absolute; inset:-2px; border-radius:20px; pointer-events:none;
    box-shadow: 0 0 0 0 rgba(159,208,255,0), 0 0 0 rgba(45,108,223,0);
    transition: box-shadow .25s ease;
  }
  .tile:hover::after, .tile:focus-visible::after{
    box-shadow: 0 0 0 4px rgba(159,208,255,.35), 0 12px 32px rgba(45,108,223,.22);
  }
  .tile.is-selected::after{
    box-shadow: 0 0 0 5px rgba(159,208,255,.45), 0 14px 36px rgba(45,108,223,.28);
  }
  .tile::before{
    content:""; position:absolute; inset:0; pointer-events:none;
    background: linear-gradient(120deg, transparent 40%, rgba(255,255,255,.38) 50%, transparent 60%);
    transform: skewX(-20deg) translateX(-140%);
    transition: transform .6s ease;
  }
  .tile:hover::before{ transform: skewX(-20deg) translateX(140%); }
  @keyframes nfxPulse{
    0%{ transform: translateY(-3px) scale(1.02); }
    50%{ transform: translateY(-6px) scale(1.035); }
    100%{ transform: translateY(-3px) scale(1.02); }
  }

  .tile-inner{
    position:absolute; inset:0; display:grid; place-items:center; padding:16px;
    background:
      radial-gradient(280px 200px at 20% 10%, rgba(94,163,255,.08), transparent 60%),
      radial-gradient(280px 200px at 80% 12%, rgba(45,108,223,.06), transparent 60%),
      linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
  }
  .pfp{
    width:84px; height:84px; border-radius:22px;
    background: radial-gradient(circle at 30% 30%, #eef6ff, #d8eaff 55%, #c6dcff);
    display:grid; place-items:center; color:#0b1020; font-weight:900; font-size:32px;
    box-shadow: inset 0 2px 10px rgba(255,255,255,.65), 0 12px 26px rgba(45,108,223,.22);
    border:1px solid rgba(203,224,255,.8);
    transition: transform .2s ease;
  }
  .pfpimg-wrap{ width:100%; display:flex; align-items:center; justify-content:center }
  .pfp-img{
    width:168px; height:148px; object-fit:cover; border-radius:22px; border:1px solid rgba(203,224,255,.9);
    box-shadow: 0 14px 30px rgba(45,108,223,.18), inset 0 1px 0 rgba(255,255,255,.7);
    background:#fff;
  }
  .tile:hover .pfp{ transform: translateY(-2px) scale(1.03); }
  .tile:hover .pfp-img{ transform: translateY(-1px); }

  /* 선택 상태를 좀 더 분명하게 */
  .tile.is-selected .label{ opacity: 0.98 }
  .tile.is-selected .pfp-img{ box-shadow: 0 14px 30px rgba(45,108,223,.2) }

  .plus{
    width:64px; height:64px; display:grid; place-items:center; border-radius:18px;
    background: radial-gradient(circle at 30% 30%, #f7fbff, #eaf5fe 60%, #dcefff);
    color:#3b6fe8; font-weight:900; font-size:36px;
    box-shadow: 0 8px 18px rgba(99,149,255,.16), inset 0 1px 0 rgba(255,255,255,.75);
    border:1px solid rgba(186,208,255,.6);
    transition: transform .2s ease;
  }
  .tile:hover .plus{ transform: translateY(-2px) scale(1.05); }

  .label{ position:absolute; left:0; right:0; bottom:18px; text-align:center; color:#0f1d2b; font-weight:700; letter-spacing:.2px; transition: transform .2s ease, opacity .2s ease; }
  .tile:hover .label{ transform: translateY(-2px) }
  .lock{ width:58px; height:58px; display:grid; place-items:center; border-radius:18px; font-size:28px; color:#3b6fe8; background: radial-gradient(circle at 30% 30%, #f7fbff, #eaf5fe 60%, #dcefff); border:1px solid rgba(186,208,255,.6); box-shadow: 0 8px 18px rgba(99,149,255,.16), inset 0 1px 0 rgba(255,255,255,.75) }

  .actions{ display:flex; gap:10px; justify-content:center; margin-top:22px }
  .btn{
    height:44px; padding:0 18px; border-radius:14px; cursor:pointer; font-weight:800; letter-spacing:.2px;
    border:1px solid var(--line); background:linear-gradient(180deg,#ffffff,#f6fbff); color:var(--ink);
    transition: transform .1s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .btn:hover{ transform:translateY(-1px); box-shadow:0 10px 20px rgba(45,108,223,.1) }
  .btn.primary{ border-color:transparent; color:#fff; background:linear-gradient(180deg, var(--cta-2), var(--cta));
    box-shadow:0 16px 34px rgba(45,108,223,.22) }
  .btn[disabled]{ opacity:.55; box-shadow:none; transform:none }

  /* Modal */
  .modal-backdrop{
    position:fixed; inset:0; background:rgba(15,23,42,.35);
    display:grid; place-items:center; z-index:50;
    animation:fadeIn .15s ease;
  }
  .modal{
    width:min(440px, 92vw);
    background:linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.86));
    backdrop-filter: blur(8px);
    border:1px solid #dbe9ff; border-radius:18px; padding:18px 18px 14px;
    box-shadow:0 30px 70px rgba(2,6,23,.25), inset 0 1px 0 rgba(255,255,255,.8);
  }
  .modal h2{ margin:0 0 6px; font-size:18px; font-weight:900; letter-spacing:-.2px; }
  .mk-sub{ margin:0 0 12px; color:#556677; font-size:13px; }
  .mk-field{ display:flex; flex-direction:column; gap:6px; margin-top:6px; }
  .mk-label{ font-size:12px; color:#738399; }
  .mk-input{
    height:44px; border-radius:12px; padding:0 12px; font-weight:600;
    border:1px solid #d9e9ff; background:linear-gradient(180deg,#fff,#f7fbff);
  }
  .mk-input:focus{ outline:none; box-shadow:0 0 0 4px rgba(159,208,255,.45); border-color:#bcd7ff; }
  .mk-actions{ display:flex; gap:10px; justify-content:flex-end; margin-top:14px; }

  @keyframes fadeIn{ from{ opacity:0; transform:translateY(4px);} to{ opacity:1; transform:translateY(0);} }
  @keyframes fadeUp{ from{ opacity:0; transform: translateY(10px) scale(.98) } to{ opacity:1; transform: translateY(0) scale(1) } }
  `}</style>
  );
}
