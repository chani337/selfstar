// Imgcreate.jsx
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE } from "@/api/client";
import Field from "../components/Field";
import StyleTag from "../components/StyleTag";

// API base join helper: API_BASE("", "https://...") 모두 안전
const api = (path) => `${(API_BASE || "").replace(/\/$/, "")}${path}`;

/* ========================= Home ========================= */
function Home({ compact = false }) {
  const location = useLocation();
  const isEmbed = new URLSearchParams(location.search).get("embed") === "1";
  // 임베드 모드일 때 부모 모달 크기 자동 조절
  useEffect(() => {
    if (!isEmbed) return;
    const sendSize = () => {
      try {
        const h = document.documentElement.scrollHeight;
        const w = document.documentElement.scrollWidth;
        window.parent?.postMessage({ type: "imgcreate-size", height: h, width: w }, "*");
      } catch {}
    };
    const onResize = () => sendSize();
    const ro = new ResizeObserver(() => sendSize());
    try { ro.observe(document.body); } catch {}
    window.addEventListener("load", sendSize);
    window.addEventListener("resize", onResize);
    // 최초 약간 지연 후 한 번 더
    const t = setTimeout(sendSize, 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", sendSize);
      try { ro.disconnect(); } catch {}
    };
  }, [isEmbed]);
  // 기본 필드
  const [name, setName] = useState("");
  const [gender, setGender] = useState(""); // 기본 없음
  const [ageStr, setAgeStr] = useState(""); // 숫자 입력 원본 유지

  // 옵션(악세사리 등) — 현재 UI 미구현이므로 선택 값만 보유
  const [selected] = useState([]);

  // 성별별 옵션 세트 (확장)
  const faceShapesByGender = {
    여: ["계란형", "둥근형", "하트형", "긴형", "각진형", "역삼각형", "오벌형"],
    남: ["각진형", "둥근형", "계란형", "긴형", "역삼각형", "오벌형"],
  };
  const skinTonesByGender = {
    여: ["밝은 17~21호", "중간 21~23호", "따뜻한 23~25호", "태닝톤", "쿨톤", "올리브톤", "피치톤"],
    남: ["중간 21~23호", "태닝톤", "따뜻한 23~25호", "쿨톤", "올리브톤", "피치톤"],
  };
  const hairsByGender = {
    여: [
      "스트레이트", "웨이브", "단발", "장발", "포니테일", "업스타일",
      "뱅헤어", "히피펌", "볼륨펌", "레이어드컷",
    ],
    남: [
      "쇼트컷", "댄디컷", "포마드", "스파이크", "장발", "투블럭",
      "리젠트컷", "크롭컷", "볼륨펌",
    ],
  };
  const eyeShapesByGender = {
    여: ["크고 또렷함", "고양이상", "강아지상", "아치형", "처진눈매", "쌍꺼풀", "아몬드형"],
    남: ["크고 또렷함", "아치형", "처진눈매", "무쌍", "아몬드형"],
  };
  const nosesByGender = {
    여: ["오똑함", "버튼", "긴코", "작은코", "직선", "둥근코"],
    남: ["오똑함", "버튼", "긴코", "직선", "넓은코"],
  };
  const lipTypesByGender = {
    여: ["도톰", "얇음", "하트", "자연", "그라데", "풀립"],
    남: ["도톰", "얇음", "자연", "풀립"],
  };
  const bodyTypesByGender = {
    여: ["마름", "슬림", "보통", "통통", "근육질", "스포츠형"],
    남: ["슬림", "보통", "통통", "근육질", "스포츠형", "마름"],
  };
  const foreheadLengthsByGender = {
    여: ["짧은 이마", "중간 이마", "긴 이마"],
    남: ["짧은 이마", "중간 이마", "긴 이마"],
  };
  const eyebrowShapesByGender = {
    여: ["일자", "아치형", "둥근형", "각진형", "얇은형"],
    남: ["일자", "아치형", "각진형", "두꺼운형"],
  };

  // MBTI 선택 (단일 선택 드롭다운)
  const personalityList = useMemo(
    () => [
      "ISTJ","ISFJ","INFJ","INTJ",
      "ISTP","ISFP","INFP","INTP",
      "ESTP","ESFP","ENFP","ENTP",
      "ESTJ","ESFJ","ENFJ","ENTJ",
    ],
    []
  );
  const [personalities, setPersonalities] = useState([]); // 기본 없음
  // 특징(멀티-선택) chips
  const featuresList = useMemo(
    () => ["귀여움", "섹시함", "시크함", "청순함", "도도함", "우아함", "카리스마", "지적임"],
    []
  );
  const [features, setFeatures] = useState([]);

  // 얼굴 디테일 6종
  const [faceShape, setFaceShape] = useState(""); // 얼굴형
  const [skinTone, setSkinTone] = useState("");   // 피부톤
  const [hair, setHair] = useState("");           // 헤어
  const [eyes, setEyes] = useState("");           // 눈
  const [nose, setNose] = useState("");           // 코
  const [lips, setLips] = useState("");           // 입
  const [foreheadLength, setForeheadLength] = useState(""); // 이마 길이
  const [eyebrowShape, setEyebrowShape] = useState("");     // 눈썹 모양

  const [bodyType, setBodyType] = useState("");   // 체형
  // 안경 항목 제거됨

  const faceShapes = faceShapesByGender[gender] || [];
  const skinTones  = skinTonesByGender[gender] || [];
  const hairs      = hairsByGender[gender] || [];
  const foreheadLengths = foreheadLengthsByGender[gender] || [];
  const eyebrowShapes  = eyebrowShapesByGender[gender] || [];
  const eyeShapes  = eyeShapesByGender[gender] || [];
  const noses      = nosesByGender[gender] || [];
  const lipTypes   = lipTypesByGender[gender] || [];
  const bodyTypes  = bodyTypesByGender[gender] || [];

  // 이미지 생성 상태
  const [generated, setGenerated] = useState(null);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [lastPayload, setLastPayload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 나이 파싱 및 검증 (1~120), 입력 중엔 제한 없이 두고 블러/저장 시 보정
  const ageNum = useMemo(() => {
    const n = Number(ageStr);
    if (!Number.isFinite(n)) return null;
    const v = Math.floor(n);
    return v >= 1 && v <= 120 ? v : null;
  }, [ageStr]);
  // 확정 버튼 활성화 여부: 인플루언서 정보(이름/성별/나이/성격) + 얼굴 디테일(6종) + 체형
  // 인플루언서 정보 완료: 이름/성별/나이/성격(선택) 필요
  const isInfoReady = Boolean(String(name || "").trim()) && Boolean(gender) && ageNum !== null && (Array.isArray(personalities) && personalities.length > 0);
  const isFaceReady = Boolean(faceShape) && Boolean(skinTone) && Boolean(hair) && Boolean(eyes) && Boolean(nose) && Boolean(lips);
  const isBodyReady = Boolean(bodyType) && (Array.isArray(personalities) && personalities.length > 0);
  const isConfirmReady = isInfoReady && isFaceReady && isBodyReady;

  // 현재 입력 상태로부터 payload 스냅샷
  const currentPayload = useMemo(
    () => ({
      name,
      gender,
      age: ageNum,
      options: selected,
      faceShape,
      skinTone,
      hair,
      eyes,
      nose,
      lips,
      foreheadLength,
      eyebrowShape,
      bodyType,
      personalities,
      features,
    }),
    [
      name,
      gender,
      ageNum,
      selected,
      faceShape,
      skinTone,
      hair,
      eyes,
      nose,
      lips,
      foreheadLength,
      eyebrowShape,
      bodyType,
      personalities,
      features,
    ]
  );

  // 마지막 생성 이후로 입력이 변경되었는지
  const isDirty = useMemo(() => {
    if (!lastPayload) return true;
    try {
      return JSON.stringify(currentPayload) !== JSON.stringify(lastPayload);
    } catch {
      return true;
    }
  }, [currentPayload, lastPayload]);

  // 버튼 가능 조건
  const canGenerate = isConfirmReady && (!generated || isDirty);
  const canConfirm = isConfirmReady && Boolean(generated) && !isDirty;

  // 공통 Select
  const Select = ({ value, onChange, children }) => (
    <div className="relative">
      <select
        className="w-full appearance-none px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={value}
        onChange={onChange}
      >
        <option value="">선택</option>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
    </div>
  );

  const onGenerate = async () => {
    if (loading) return;
    setGenerated(null);
    setError(null);
    setGeneratedUrl("");
    setStatus("");
    setLoading(true);

    const payload = currentPayload;

    const MAX_RETRY = 2;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        setStatus(attempt === 1 ? "생성중…" : `다시 시도중… (${attempt}/${MAX_RETRY})`);
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 60_000);

        // POST /api/images/preview: 이미지 생성 미리보기 요청 (저장 없음)
        const res = await fetch(api("/api/images/preview"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.message || "generation failed");

        // 미리보기: 저장하지 않고 data URI만 세팅
        setGenerated(data.image);
        setGeneratedUrl("");
        setLastPayload(payload);
        setStatus("");
        break;
      } catch (e) {
        if (attempt === MAX_RETRY) {
          setError(`이미지 생성 실패: ${e?.name === "AbortError" ? "요청 시간 초과" : (e?.message || e)}`);
          setStatus("에러");
        } else {
          setStatus(`에러, 다시 시도중… (${attempt + 1}/${MAX_RETRY})`);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }
    setLoading(false);
  };

  // 성별 변환 및 생년월일 계산 (나이 기준 단순 변환: 해당 연도의 1월 1일)
  const mapGender = (g) => (g === "남" ? "남성" : g === "여" ? "여성" : null);
  const birthdayFromAge = (a) => {
    const n = Number(a);
    if (!Number.isFinite(n) || n <= 0 || n > 120) return null;
    const today = new Date();
    const year = today.getFullYear() - n;
    return `${year}-01-01`;
  };

  const doSaveProfile = async () => {
    if (saving) return;
    // 나이 -> 생년월일, 성별 매핑
    const bday = birthdayFromAge(ageNum);
    const mappedGender = mapGender(gender);
    if (!bday) {
      setError("유효한 나이를 입력해주세요.");
      return;
    }
    if (!mappedGender) {
      setError("성별을 선택해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 1) 사용자 프로필 저장 (생일/성별)
  // PUT /api/users/me/profile: 사용자 프로필(생일/성별) 저장
  console.log("[save] step1 PUT /api/users/me/profile", { birthday: bday, gender: mappedGender });
      const res = await fetch(api(`/api/users/me/profile`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ birthday: bday, gender: mappedGender }),
      });
      console.log("[save] step1 status", res.status);
      if (res.status === 401) throw new Error("로그인이 필요합니다.");
      if (!res.ok) throw new Error(`프로필 저장 실패: ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "프로필 저장 실패");

      // 2) 페르소나 저장 먼저 실행하여 번호 확보 (/api/personas/setting)
      const personaBody = {
        // 임시 이미지 값: '/media/pending' 로 두어 서버의 S3 presign 시도를 피함
        persona_img: "/media/pending",
        persona_parameters: currentPayload,
      };
  // PUT /api/personas/setting: 페르소나 생성(번호 발급)
  console.log("[save] step2 PUT /api/personas/setting (create persona first)", personaBody);
      const savePersona = await fetch(api(`/api/personas/setting`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(personaBody),
      });
      console.log("[save] step2 status", savePersona.status);
      if (savePersona.status === 400) {
        // 서버에서 제한 초과 시 detail 전달: persona_limit_reached
        const t = await savePersona.text();
        if (t.includes("persona_limit_reached")) {
          throw new Error("페르소나는 최대 4개까지 저장할 수 있습니다.");
        }
        throw new Error(`페르소나 저장 실패: HTTP 400`);
      }
      if (savePersona.status === 401) throw new Error("로그인이 필요합니다.");
      if (!savePersona.ok) {
        const t = await savePersona.text().catch(() => "");
        throw new Error(`페르소나 저장 실패: ${savePersona.status} ${t || ""}`.trim());
      }
      const savedPersona = await savePersona.json();
      if (!savedPersona?.ok) throw new Error(savedPersona?.message || "페르소나 저장 실패");
      const personaNum = savedPersona?.persona_num;
      if (typeof personaNum !== "number") throw new Error("유효한 페르소나 번호를 받지 못했습니다.");

      // 3) 생성된 이미지 파일을 최종 경로로 저장 (S3: personas/{num}/png)
      if (!generated) throw new Error("이미지 미리보기가 없습니다. 먼저 생성해주세요.");
      const saveBody = {
        image: generated,
        // 경로 구성 옵션: dev/ 제거, personas/ 바로 하위에 이미지 저장 (하위 폴더 없음)
        base_prefix: "", // 기본 prefix 비활성화 (예: dev/ 제거)
        prefix: "personas",
        include_model: false,
        include_date: false,
        persona_num: personaNum,
      };
  // POST /api/images/save: 미리보기 이미지를 S3에 최종 저장 (DB 링크 자동 반영)
  console.log("[save] step3 POST /api/images/save", { ...saveBody, image: `[dataURI ${generated?.length ?? 0}]` });
      const saveImg = await fetch(api(`/api/images/save`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(saveBody),
      });
      console.log("[save] step3 status", saveImg.status);
      if (saveImg.status === 401) throw new Error("로그인이 필요합니다.");
      if (!saveImg.ok) {
        const t = await saveImg.text().catch(() => "");
        throw new Error(`이미지 저장 실패: ${saveImg.status} ${t || ""}`.trim());
      }
      const saved = await saveImg.json();
      const mediaUrl = saved?.url;
      const s3Key = saved?.key;
      if (!mediaUrl) throw new Error("이미지 저장 URL을 받지 못했습니다.");
      console.log("[save] step3 ok, url=", mediaUrl, "key=", s3Key);
      // 업로드된 정식 URL로 프리뷰 전환 (dataURI -> 네트워크 URL)
      try { setGeneratedUrl(mediaUrl); } catch {}

      setStatus("프로필/페르소나 저장 완료");
      // 저장 완료 후: 새 프로필 번호를 시스템에 전달하고, 활성 프로필로 지정
      try {
        if (typeof personaNum === "number") {
          try { localStorage.setItem("activePersonaNum", String(personaNum)); } catch {}
          // 로컬 이벤트로 알림
          window.dispatchEvent(new CustomEvent("persona-created", { detail: { persona_num: personaNum, from: "imgcreate" } }));
          // iframe 부모 창에도 알림
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "persona-created", persona_num: personaNum, from: "imgcreate" }, "*");
          }
        }
      } catch { /* noop */ }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StyleTag />

      <main className={isEmbed ? "mx-auto w-full max-w-7xl p-3" : "mx-auto max-w-6xl px-4 py-6 md:py-8 min-h-screen"}>
        <div
          className={isEmbed ? "grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch isolate" : "grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-stretch isolate"}
          style={isEmbed ? { height: "calc(100dvh - 24px)" } : undefined}
        >
          {/* 좌측 미리보기 카드 */}
          <section className="card overflow-hidden h-full z-0 bg-white">
            <div className="bg-black flex items-center justify-center">
              <div className="relative w-full max-w-[520px] aspect-square" aria-busy={loading} aria-live="polite">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-blue-200 bg-black/40">
                    <span className="animate-pulse">{status || "생성중…"}</span>
                  </div>
                ) : (generatedUrl || generated) ? (
                  <img
                    src={generatedUrl || generated}
                    alt="generated"
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => {
                      if (generated && e.currentTarget.src !== generated) {
                        e.currentTarget.src = generated;
                      }
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-white pointer-events-none" />
                )}
              </div>
            </div>
            <div className="p-4 bg-blue-50">
              <h3 className="text-xl md:text-2xl font-semibold mb-1 tracking-tight">나만의 인플루언서를 만들어보세요.</h3>
              <p className="text-xs md:text-sm text-slate-600">얼굴 ID를 고정할 때 일상과 바뀐 다양한 결과를 얻을 수 있습니다.</p>
            </div>
          </section>

          {/* 우측 입력 카드 */}
          <section
            className="rounded-2xl border border-blue-200 bg-white p-5 md:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] relative text-left z-10 overflow-y-auto pr-2 h-full"
          >

            {/* 인플루언서 정보 */}
            <div className="mt-1 mb-1 text-base font-semibold">인플루언서 정보</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="이름" compact>
                <input
                  className="w-full px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field label="성별" compact>
                <div className="relative">
                  <select
                    className="w-full appearance-none px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">없음</option>
                    <option value="여">여</option>
                    <option value="남">남</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
                </div>
              </Field>
            </div>

            {/* 나이 */}
            <div className="grid grid-cols-2 gap-4 mt-1">
              <Field label="나이" compact>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="w-full px-4 py-2 rounded-lg border border-blue-200 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={ageStr}
                  onChange={(e) => {
                    const v = String(e.target.value).replace(/[^\d]/g, "");
                    setAgeStr(v);
                  }}
                  onBlur={() => {
                    if (ageStr === "") return;
                    const n = Number(ageStr);
                    if (!Number.isFinite(n)) { setAgeStr(""); return; }
                    const clamped = Math.max(1, Math.min(120, Math.floor(n)));
                    setAgeStr(String(clamped));
                  }}
                  placeholder="예: 23"
                />
              </Field>
                      {/* MBTI: 드롭다운 (상단 정보 영역에 배치) */}
                      <Field label="MBTI" compact>
                        <Select
                          value={personalities[0] || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPersonalities(v ? [v] : []);
                          }}
                        >
                          {personalityList.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </Select>
                      </Field>
            </div>

            {/* 얼굴 디테일: 인플루언서 정보 완료 시 애니메이션 표시 */}
            <div
              className={(isInfoReady ? "max-h-[2000px] opacity-100 translate-y-0 " : "max-h-0 opacity-0 -translate-y-1 pointer-events-none overflow-hidden ") + "transition-all duration-500 ease-out"}
            >
              <div className="mt-1 mb-2 text-base font-semibold">얼굴 디테일</div>
              <div className="grid grid-cols-2 gap-5">
              <Field label="얼굴형" compact>
                <Select value={faceShape} onChange={(e) => setFaceShape(e.target.value)}>
                  {faceShapes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="피부톤" compact>
                <Select value={skinTone} onChange={(e) => setSkinTone(e.target.value)}>
                  {skinTones.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="이마 길이" compact>
                <Select value={foreheadLength} onChange={(e) => setForeheadLength(e.target.value)}>
                  {foreheadLengths.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="눈썹 모양" compact>
                <Select value={eyebrowShape} onChange={(e) => setEyebrowShape(e.target.value)}>
                  {eyebrowShapes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="헤어" compact>
                <Select value={hair} onChange={(e) => setHair(e.target.value)}>
                  {hairs.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="눈" compact>
                <Select value={eyes} onChange={(e) => setEyes(e.target.value)}>
                  {eyeShapes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="코" compact>
                <Select value={nose} onChange={(e) => setNose(e.target.value)}>
                  {noses.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>

              <Field label="입" compact>
                <Select value={lips} onChange={(e) => setLips(e.target.value)}>
                  {lipTypes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>
              </div>
            </div>

            {/* 체형/특징: 인플루언서 정보 완료 시 애니메이션 표시 */}
            <div
              className={(isInfoReady ? "max-h-[1200px] opacity-100 translate-y-0 " : "max-h-0 opacity-0 -translate-y-1 pointer-events-none overflow-hidden ") + "transition-all duration-500 ease-out"}
            >
              {/* 체형 */}
              <div className="mt-4 mb-2 text-sm font-semibold">체형</div>

              <div className="chip-row-left chip-grid-left mb-4 w-full">
                {bodyTypes.map((p) => {
                  const on = bodyType === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBodyType(on ? "" : p)}
                      className={"chip " + (on ? "chip-on" : "")}
                      aria-pressed={on}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              {/* 특징(멀티-선택) */}
              <div className="mt-4 mb-2 text-sm font-semibold">특징</div>
              <div className="chip-row-left chip-grid-left mb-4 w-full">
                {featuresList.map((feature) => {
                  const on = features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() =>
                        setFeatures((prev) =>
                          prev.includes(feature)
                            ? prev.filter((f) => f !== feature)
                            : [...prev, feature]
                        )
                      }
                      className={"chip " + (on ? "chip-on" : "")}
                      aria-pressed={on}
                    >
                      {feature}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 버튼: 인플루언서 정보가 완료되면(= 얼굴 디테일이 열릴 때) 함께 표시 */}
            {isInfoReady && (
              <div className="flex justify-end gap-2 mt-4">
                <button
                  className={`${canGenerate ? "btn-primary" : "btn-outline"} ${(loading || !canGenerate) ? "opacity-60" : ""}`}
                  type="button"
                  onClick={onGenerate}
                  disabled={loading || !canGenerate}
                >
                  이미지 생성
                </button>
                <button
                  className={`${canConfirm ? "btn-primary" : "btn-outline"} ${((loading || saving) || !canConfirm) ? "opacity-60" : ""}`}
                  onClick={() => {
                    if (!canConfirm || loading || saving) return;
                    if (!generated || !lastPayload) {
                      setError("먼저 이미지를 생성하세요.");
                      return;
                    }
                    setConfirmOpen(true);
                  }}
                  disabled={(loading || saving) || !canConfirm}
                >
                  {saving ? "저장중…" : "프로필 저장"}
                </button>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
          </section>
        </div>
      </main>

      {/* 확인 모달: 프로필 저장 전에 한번 더 묻기 */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="relative w-[min(420px,94vw)] rounded-2xl border border-blue-200 bg-white p-5 shadow-[0_30px_70px_rgba(2,6,23,.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="닫기"
              onClick={() => setConfirmOpen(false)}
              className="absolute top-2.5 right-3 w-8 h-8 rounded-full border bg-white shadow"
            >
              ×
            </button>
            <h3 className="text-lg font-bold mb-1">저장 하시겠습니까?</h3>
            <p className="text-sm text-slate-600">입력하신 성별/생년월일 정보가 프로필에 저장됩니다.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-outline" onClick={() => setConfirmOpen(false)}>아니요</button>
              <button
                className="btn-primary disabled:opacity-60"
                disabled={saving}
                onClick={async () => {
                  await doSaveProfile();
                  setConfirmOpen(false);
                }}
              >
                {saving ? "저장중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default Home;
