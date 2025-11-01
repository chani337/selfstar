// SelfStarOnboarding.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import fixedFace from "../../img/fixed_face.png";
import ProfileSelect from "./ProfileSelect";
import { API_BASE } from "@/api/client";

/**
 * SelfStar 온보딩 (EAF5FE 계열)
 * Step1: 성별 선택  (세로 배치)
 * Step2: 생년월일 입력(Year/Month/Day Select, 만 13세 이상만 가능)
 *
 * 사용법:
 * <SelfStarOnboarding
 *   onComplete={(data) => console.log(data)}   // { gender, birth: "YYYY-MM-DD" }
 * />
 */

export default function SelfStarOnboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState("");
  const [birth, setBirth] = useState({ y: "", m: "", d: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showProfileSelect, setShowProfileSelect] = useState(false);

  const goNextFromGender = useCallback((val) => {
    setGender(val);
    setStep(2);
  }, []);

  const goPrevFromBirth = useCallback(() => setStep(1), []);

  const birthIso = useMemo(() => {
    const { y, m, d } = birth;
    if (!y || !m || !d) return "";
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }, [birth]);

  const finish = useCallback(async () => {
    if (!birthIso || !gender || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 서버에 성별+생년월일 동시 저장
      const res = await fetch(`${API_BASE}/api/users/me/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ birthday: birthIso, gender }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`프로필 저장 실패: HTTP ${res.status} ${t}`);
      }
      const data = await res.json().catch(() => null);
  if (onComplete) onComplete({ gender, birth: birthIso, server: data });
  // 온보딩 완료 후: 바로 ImgCreate로 이동하지 않고 프로필 선택 모달 오픈
  setShowProfileSelect(true);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }, [birthIso, gender, submitting, onComplete]);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <StyleTag />

      <div className="ss-wrap">
        <div className="ss-blob" />
        <div className="ss-blob b2" />
        <div className="ss-blob b3" />

        <div className="ss-container">
          <section className="ss-card" role="region" aria-label="SelfStar Onboarding">
            {/* Header */}
            <div className="ss-top">
              <div className="ss-brand">
                <div className="ss-logo" aria-hidden="true">
                  <img src={fixedFace} alt="SelfStar Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} />
                </div>
                <div>
                  <GuideBubble step={step} />
                </div>
              </div>
              <div className="ss-step" aria-hidden="true">
                <span className={`bar ${step === 1 ? "active" : ""}`} />
                <span className={`bar ${step === 2 ? "active" : ""}`} />
                <span className="bar" />
              </div>
            </div>

            {/* Steps with smooth transition */}
            <div className="ss-viewport">
              <div className={`ss-slider ${step === 1 ? "at-1" : "at-2"}`}>
                <div className="ss-slide">
                  <GenderStepInner
                    value={gender}
                    onPrev={() => window.history.back()}
                    onNext={goNextFromGender}
                    onChange={setGender}
                  />
                </div>
                <div className="ss-slide">
                  <BirthStepInner
                    value={birth}
                    onChange={setBirth}
                    onPrev={goPrevFromBirth}
                    onNext={finish}
                    submitting={submitting}
                    error={error}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      {showProfileSelect && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "min(1200px, 96vw)",
              maxHeight: "96dvh",
              overflow: "auto",
              borderRadius: 18,
              boxShadow: "0 30px 70px rgba(2,6,23,.35)",
              background: "#fff",
            }}
          >
            {/* ProfileSelect 자체가 페이지 레이아웃을 포함하지만, 모달 내에서도 정상 렌더링됩니다. */}
            <ProfileSelect maxSlots={4} />
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Guide Bubble (ConsentPage 스타일) -------------------- */
function GuideBubble({ step }) {
  const segments = useMemo(() => {
    if (step === 1) {
      return [
        { text: "프로필 생성 ", bold: false },
        { text: ".", bold: true },
        { text: " ", bold: false },
        { text: "성별", bold: true },
        { text: "을 알려주세요.", bold: false },
      ];
    }
    return [
      { text: "프로필 생성 ", bold: false },
      { text: "SelfStar 가이드", bold: true },
      { text: " ", bold: false },
      { text: "생년월일", bold: true },
      { text: "을 알려주세요.", bold: false },
    ];
  }, [step]);

  const flat = useMemo(() => segments.map(s => s.text).join(""), [segments]);
  const [typed, setTyped] = useState(0);
  const done = typed >= flat.length;

  useEffect(() => {
    setTyped(0);
  }, [flat]);

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setTyped(v => Math.min(v + 1, flat.length)), 18);
    return () => clearTimeout(id);
  }, [typed, flat.length, done]);

  let acc = 0;
  return (
    <div className="ss-guide-wrap">
      <div className="ss-guide">
        {segments.map((seg, idx) => {
          const start = acc;
          acc += seg.text.length;
          const showCount = Math.max(0, Math.min(typed - start, seg.text.length));
          const shown = seg.text.slice(0, showCount);
          return (
            <span key={idx} className={seg.bold ? "b" : undefined}>
              {shown}
            </span>
          );
        })}
        {!done && <span className="caret" aria-hidden="true">|</span>}
      </div>
    </div>
  );
}

/* -------------------- Step 1: Gender -------------------- */
function GenderStepInner({ value = "", onChange, onNext, onPrev }) {
  const [selected, setSelected] = useState(value);
  useEffect(() => setSelected(value), [value]);

  const setAndEmit = useCallback(
    (val) => {
      setSelected(val);
      onChange && onChange(val);
    },
    [onChange]
  );
  const canNext = !!selected;

  return (
    <>
      <div className="ss-fieldset" aria-label="성별 선택">
        <p className="ss-label">성별</p>
        <div className="ss-choices" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={selected === "남성"}
            className="ss-chip"
            onClick={() => setAndEmit("남성")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAndEmit("남성");
              }
            }}
          >
            남성 <span className="ss-check">✓</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={selected === "여성"}
            className="ss-chip"
            onClick={() => setAndEmit("여성")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAndEmit("여성");
              }
            }}
          >
            여성 <span className="ss-check">✓</span>
          </button>
        </div>
      </div>

      <div className="ss-hr" aria-hidden="true" />
      <nav className="ss-actions" aria-label="이동">
        <button className="ss-btn" type="button" onClick={onPrev}>
          이전
        </button>
        <button
          className="ss-btn primary"
          type="button"
          disabled={!canNext}
          onClick={() => canNext && onNext(selected)}
        >
          다음
        </button>
      </nav>
      <div className="ss-shadow-foot" aria-hidden="true" />
    </>
  );
}

/* -------------------- Step 2: Birthdate -------------------- */
function BirthStepInner({ value = { y: "", m: "", d: "" }, onChange, onPrev, onNext, submitting = false, error = null }) {
  const now = useMemo(() => new Date(), []);
  const maxYear = now.getFullYear() - 13; // 만 13세 이상
  const minYear = maxYear - 87; // 최대 100세 기준 여유

  const years = useMemo(() => {
    const arr = [];
    for (let y = maxYear; y >= minYear; y--) arr.push(y);
    return arr;
  }, [maxYear, minYear]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const daysInMonth = useCallback((y, m) => new Date(y || 2000, m || 1, 0).getDate(), []);

  const days = useMemo(() => {
    const y = Number(value.y);
    const m = Number(value.m);
    const cnt = daysInMonth(y || 2000, m || 1);
    return Array.from({ length: cnt }, (_, i) => i + 1);
  }, [value.y, value.m, daysInMonth]);

  const valid = useMemo(() => {
    if (!value.y || !value.m || !value.d) return false;
    const y = Number(value.y),
      m = Number(value.m),
      d = Number(value.d);
    if (!y || !m || !d) return false;
    // 나이 체크
    const birth = new Date(y, m - 1, d);
    const minDate = new Date(maxYear, now.getMonth(), now.getDate()); // 13세 기준
    return !Number.isNaN(birth.getTime()) && y <= maxYear && birth <= now && birth <= minDate;
  }, [value, maxYear, now]);

  const setPart = (k, v) => onChange && onChange({ ...value, [k]: v });

  return (
    <>
      <div className="ss-fieldset" aria-label="생년월일">
        <p className="ss-label">생년월일</p>

        <div className="ss-row-3">
          <Select label="년" value={value.y} onChange={(e) => setPart("y", e.target.value)}>
            <option value="">선택</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </Select>

          <Select label="월" value={value.m} onChange={(e) => setPart("m", e.target.value)}>
            <option value="">선택</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}월
              </option>
            ))}
          </Select>

          <Select label="일" value={value.d} onChange={(e) => setPart("d", e.target.value)}>
            <option value="">선택</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {String(d).padStart(2, "0")}일
              </option>
            ))}
          </Select>
        </div>

        <p className="ss-hint">만 13세 이상만 가입 가능합니다.</p>
      </div>

      <div className="ss-hr" aria-hidden="true" />
      {error && (
        <div role="alert" style={{ color: "#dc2626", margin: "6px 2px 0" }}>{error}</div>
      )}
      <nav className="ss-actions" aria-label="이동">
        <button className="ss-btn" type="button" onClick={onPrev}>
          이전
        </button>
        <button className="ss-btn primary" type="button" disabled={!valid || submitting} onClick={onNext}>
          {submitting ? "저장 중..." : "완료"}
        </button>
      </nav>
      <div className="ss-shadow-foot" aria-hidden="true" />
    </>
  );
}

/* -------------------- 재사용 Select 컴포넌트 -------------------- */
function Select({ label, children, ...props }) {
  return (
    <label className="ss-select">
      <span className="ss-select-label">{label}</span>
      <select className="ss-field" {...props}>
        {children}
      </select>
      <span className="ss-caret" aria-hidden="true">▾</span>
    </label>
  );
}

/* -------------------- 공통 스타일 -------------------- */
function StyleTag() {
  return (
    <style>{`
      :root{
        --bg-0:#f7fbff; --bg-1:#eaf5fe; --bg-2:#dff0ff;
        --ink:#0f1d2b; --muted:#5c6f83; --line:#cfe3fb; --glow:#9fd0ff;
        --cta:#2d6cdf; --cta-2:#5ea3ff; --white:#ffffff;
        --header-h:64px; /* App 헤더 높이 (h-16) */
      }
      *{box-sizing:border-box}

      .ss-wrap{
        /* 헤더를 제외한 영역에 정확히 맞춰 중앙 정렬 */
        min-height:calc(100dvh - var(--header-h));
        display:flex; align-items:center; justify-content:center;
        background:
          radial-gradient(1200px 700px at 20% -10%, var(--bg-2), var(--bg-1)),
          linear-gradient(180deg, var(--bg-0), var(--bg-1));
        overflow:hidden;
        font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color:var(--ink);
      }
      .ss-blob{
        position:fixed; filter:blur(40px); opacity:.45; pointer-events:none;
        transform:translate(-50%,-50%); border-radius:50%;
        background:radial-gradient(circle at 30% 30%, #b7dcff, #eaf5fe 60%);
        width:520px; height:520px; left:12%; top:-8%;
        animation:ss-float 12s ease-in-out infinite;
      }
      .ss-blob.b2{left:88%; top:10%; width:420px; height:420px; animation-duration:15s}
      .ss-blob.b3{left:50%; top:110%; width:560px; height:560px; animation-duration:18s}
      @keyframes ss-float{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(18px)}}

  .ss-container{width:min(780px,92vw); padding:clamp(12px,2.5vh,24px)}
      .ss-card{
        position:relative; background:linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.64));
        backdrop-filter: blur(14px); border:1px solid var(--line); border-radius:24px;
        box-shadow:0 16px 50px rgba(45,108,223,.12), 0 3px 18px rgba(15,29,43,.08), inset 0 1px 0 rgba(255,255,255,.65);
        padding:clamp(18px,2.4vh,28px) clamp(18px,2.4vh,28px) clamp(14px,2vh,22px);
      }
      .ss-top{display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px}
      .ss-brand{display:flex; align-items:center; gap:12px}
      .ss-logo{width:36px; height:36px; border-radius:12px; background:radial-gradient(circle at 30% 30%, #c9e3ff, #7dbbff 55%, #5ea3ff);
        box-shadow: inset 0 2px 6px rgba(255,255,255,.8); border:1px solid #b7d9ff}
      .ss-title{margin:0; font-size:18px; font-weight:800; letter-spacing:-.2px}
      .ss-sub{margin:6px 2px 0; color:var(--muted); font-size:13.5px}
      /* Guide bubble (ConsentPage 스타일) */
      .ss-guide-wrap{ margin:6px 2px 0; text-align:left; }
      .ss-guide{
        display:inline-block; max-width:560px;
        background:linear-gradient(180deg,#ffffff,#f7fbff);
        border:1px solid var(--line); border-radius:14px; padding:10px 12px;
        color:#334155; font-size:13.5px; line-height:1.55;
        box-shadow: 0 8px 18px rgba(45,108,223,.06), inset 0 1px 0 rgba(255,255,255,.9);
      }
      .ss-guide .b{ font-weight:800; color:#0f172a; }
      .ss-guide .caret{ display:inline-block; width:8px; color:#2563eb; margin-left:2px; animation:blink .9s steps(1) infinite; }
      @keyframes blink { 50% { opacity: 0; } }
      .ss-step{display:flex; gap:8px; align-items:center}
      .ss-step .bar{width:56px; height:6px; border-radius:8px; background:#dbeeff; box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}
      .ss-step .bar.active{background:linear-gradient(90deg, var(--cta), var(--cta-2)); box-shadow:0 0 0 4px rgba(159,208,255,.25)}

      /* Viewport & slide animation */
  .ss-viewport{position:relative; overflow:hidden; min-height: 240px}
      .ss-slider{display:flex; width:200%; transition: transform .38s ease}
      .ss-slider.at-1{ transform: translateX(0) }
      .ss-slider.at-2{ transform: translateX(-50%) }
      .ss-slide{width:50%; padding-right:12px; padding-left:4px; opacity:1; transition:opacity .3s ease}

      /* Common blocks */
      .ss-fieldset{margin-top:22px}
      .ss-label{font-size:12px; color:var(--muted); margin:0 2px 10px}

      /* Gender chips (vertical) */
      .ss-choices{display:grid; grid-template-columns:1fr; gap:14px}
      .ss-chip{
        position:relative; isolation:isolate; display:flex; align-items:center; justify-content:center;
        height:56px; border-radius:18px; cursor:pointer; font-weight:700; letter-spacing:.2px; color:var(--ink);
        background:linear-gradient(180deg,#ffffff,#f6fbff); border:1px solid var(--line);
        box-shadow:0 6px 18px rgba(45,108,223,.08), inset 0 1px 0 rgba(255,255,255,.9);
        transition: transform .12s ease, box-shadow .18s ease, border-color .18s ease, background .2s ease;
      }
      .ss-chip:hover{ transform:translateY(-2px); box-shadow:0 12px 26px rgba(45,108,223,.12) }
      .ss-chip:focus-visible{ outline:none; box-shadow:0 0 0 4px var(--glow) }
      .ss-chip[aria-checked="true"]{ color:#fff; border-color:transparent; background:linear-gradient(180deg, var(--cta-2), var(--cta));
        box-shadow:0 14px 32px rgba(45,108,223,.25), inset 0 1px 0 rgba(255,255,255,.2)}
      .ss-check{position:absolute; right:10px; top:10px; width:22px; height:22px; border-radius:10px; background:#fff; color:#12b981;
        display:grid; place-items:center; font-size:14px; font-weight:900; box-shadow:0 6px 16px rgba(15,29,43,.12);
        transform:scale(.6); opacity:0; transition:transform .18s ease, opacity .18s ease}
      .ss-chip[aria-checked="true"] .ss-check{transform:scale(1); opacity:1}

      .ss-hr{height:1px; background:linear-gradient(90deg, transparent, #e5f0ff, transparent); margin:22px 0}
      .ss-actions{display:flex; gap:10px; justify-content:flex-end}
      .ss-btn{
        height:44px; padding:0 18px; border-radius:14px; cursor:pointer; font-weight:800; letter-spacing:.2px;
        border:1px solid var(--line); background:linear-gradient(180deg,#ffffff,#f6fbff); color:var(--ink);
        transition: transform .1s ease, box-shadow .18s ease, border-color .18s ease;
      }
      .ss-btn:hover{ transform:translateY(-1px); box-shadow:0 10px 20px rgba(45,108,223,.1) }
      .ss-btn:focus-visible{ outline:none; box-shadow:0 0 0 4px var(--glow) }
      .ss-btn.primary{ border-color:transparent; color:#fff; background:linear-gradient(180deg, var(--cta-2), var(--cta));
        box-shadow:0 16px 34px rgba(45,108,223,.22) }
  .ss-btn[disabled]{opacity:.55; transform:none; box-shadow:none}
      .ss-shadow-foot{position:absolute; left:24px; right:24px; bottom:-14px; height:28px;
        background: radial-gradient(80% 100% at 50% 0%, rgba(45,108,223,.16), rgba(45,108,223,0)); border-radius:50%}

      /* 작은 화면(세로 높이 제한)에서 패딩/높이 최적화 */
      @media (max-height: 720px){
        .ss-card{ padding:16px 16px 12px }
        .ss-viewport{ min-height: 200px }
      }

      /* Birth selects */
      .ss-row-3{display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px}
      @media (max-width:560px){ .ss-row-3{ grid-template-columns:1fr } }
      .ss-select{display:flex; flex-direction:column; gap:6px}
      .ss-select-label{font-size:12px; color:var(--muted)}
      .ss-field{
        appearance:none; width:100%; height:48px; padding:0 38px 0 14px;
        border:1px solid var(--line); border-radius:14px;
        background:linear-gradient(180deg,#ffffff,#f6fbff);
        color:var(--ink); font-weight:600;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
        transition: box-shadow .15s ease, border-color .15s ease;
      }
      .ss-field:focus{ outline:none; border-color:var(--cta-2); box-shadow:0 0 0 4px var(--glow) }
      .ss-caret{position:relative; margin-left:-28px; align-self:flex-end; transform:translate(-12px, -36px)}
      .ss-hint{margin:10px 2px 0; font-size:12px; color:var(--muted)}
    `}</style>
  );
}
