import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "@/api/client";

export default function MyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("posts");
  const [todos, setTodos] = useState([
    { id: 1, text: "프로필 소개 업데이트", done: false },
    { id: 2, text: "인스타 연동 확인", done: false },
    { id: 3, text: "샘플 사진 5장 업로드", done: false },
  ]);
  const credit = 0;
  const creditMax = 100;

  // Personas state
  const [personas, setPersonas] = useState([]); // [{ num, img, name }]
  const [activePersona, setActivePersona] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [loadingPersona, setLoadingPersona] = useState(false);
  // Gallery state (chat-generated images)
  const [gallery, setGallery] = useState([]); // [{id, key, url, created_at}]
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState(null);
  // Instagram linking state
  const [igAccounts, setIgAccounts] = useState(null);
  const [igAccountsPersonaNum, setIgAccountsPersonaNum] = useState(null); // which persona these accounts belong to
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState(null);
  const [igMapping, setIgMapping] = useState(null); // { user_id, user_persona_num, ig_user_id, ig_username, fb_page_id }
  const [igMappingLoading, setIgMappingLoading] = useState(false);
  // Insights는 마이페이지에서 표시하지 않음(대시보드 전용)
  // But we do show a simple follower count in header when linked
  const [followerCount, setFollowerCount] = useState(null);

  // Instagram posts (DB-cached) state
  const [instaPosts, setInstaPosts] = useState([]); // [{id, media_url, thumbnail_url, permalink, timestamp, like_count, comments_count}]
  const [instaLoading, setInstaLoading] = useState(false);
  const [instaError, setInstaError] = useState(null);

  // Helper: build and navigate to OAuth start (keeps current flags)
  const startInstagramOAuth = useCallback(() => {
    if (!activePersona?.num) {
      alert("먼저 연동할 프로필을 선택하세요.");
      setSelectorOpen(true);
      return;
    }
    const personaParam = `?persona_num=${activePersona.num}`;
    // logout=1은 일부 환경에서 페이스북 홈으로 튀는 사례가 있어 기본값에서 제외
    window.location.href = `${API_BASE}/oauth/instagram/start${personaParam}&fresh=1&revoke=1&picker=1`;
  }, [activePersona?.num]);

  const unlinkAndReauth = async () => {
    if (!activePersona?.num) { setSelectorOpen(true); return; }
    try {
      const res = await fetch(`${API_BASE}/oauth/instagram/unlink?persona_num=${activePersona.num}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.debug('[MyPage] unlink failed (continuing to reauth)', err);
    }
    startInstagramOAuth();
  };

  useEffect(() => {
    let alive = true;
    const saved = Number(localStorage.getItem("activePersonaNum") || "0");
    (async () => {
      try {
        setLoadingPersona(true);
  const res = await fetch(`${API_BASE}/api/personas/me`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        items.sort((a, b) => (a.num || 0) - (b.num || 0));
        setPersonas(items);
        const picked = items.find((p) => p.num === saved) || items[0] || null;
        setActivePersona(picked);
        if (picked?.num) localStorage.setItem("activePersonaNum", String(picked.num));
      } catch (err) {
        console.debug("[MyPage] load personas failed", err);
      } finally {
        setLoadingPersona(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const choosePersona = (p) => {
    setActivePersona(p);
    if (p?.num) localStorage.setItem("activePersonaNum", String(p.num));
    setSelectorOpen(false);
  try { window.dispatchEvent(new CustomEvent("persona-chosen", { detail: p })); } catch (err) { console.debug("[MyPage] dispatch persona-chosen failed", err); }
    // Clear IG data to avoid showing previous persona's accounts/mapping
    setIgAccounts(null);
    setIgAccountsPersonaNum(null);
    setIgError(null);
    // Clear gallery to force reload
    setGallery([]);
    setGalleryError(null);
  };

  // After Instagram OAuth returns (?ig=connected), auto-open integrations modal and clean URL.
  // Important: do NOT force-open the local profile selector here.
  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (params.get("ig") === "connected") {
      // Ensure profile selector isn't visible when returning from OAuth
      setSelectorOpen(false);
      setIntegrationsOpen(true);
      // Clean the URL quietly
      params.delete("ig");
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Load Instagram accounts when integrations modal opens
  useEffect(() => {
    const load = async () => {
      if (!integrationsOpen) return;
      // 페르소나 상태가 아직 로딩 중이면 기다렸다가 다음 렌더에서 시도
      if (loadingPersona) return;
      if (!activePersona?.num) {
        // 자동으로 프로필 교체 모달을 열지 않고, 연동관리 모달 내에서만 안내
        setIgError("프로필을 먼저 선택하세요.");
        return;
      }
      setIgLoading(true);
      setIgError(null);
      try {
        const personaParam = `?persona_num=${activePersona.num}`;
        const res = await fetch(`${API_BASE}/oauth/instagram/accounts${personaParam}`, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            // 페르소나 토큰 만료/부재: 자동 리다이렉트하지 않고 모달 내에서 안내만 표시
            setIgLoading(false);
            setIgError("인증이 만료되었거나 권한이 없습니다. 아래 '다시 인증'을 눌러 재연동해 주세요.");
            setIgAccounts([]);
            return;
          }
          // 400 등의 기타 오류는 프로필 모달을 자동으로 열지 않고, 모달 내 오류 안내만 표시
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data?.warning && !Array.isArray(data?.items)) {
          setIgError(String(data.warning));
          setIgAccounts([]);
        } else {
          setIgAccounts(Array.isArray(data?.items) ? data.items : []);
          setIgAccountsPersonaNum(activePersona.num);
        }
      } catch (e) {
        setIgError(e?.message || String(e));
        setIgAccounts(null);
      } finally {
        setIgLoading(false);
      }
    };
    load();
  }, [integrationsOpen, activePersona?.num, loadingPersona, startInstagramOAuth]);

  // Load current persona's IG mapping to show linked status
  useEffect(() => {
    const loadMapping = async () => {
      if (!activePersona?.num) { setIgMapping(null); return; }
      try {
        setIgMappingLoading(true);
        const res = await fetch(`${API_BASE}/oauth/instagram/mapping?persona_num=${activePersona.num}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.linked && data?.mapping) setIgMapping(data.mapping);
        else setIgMapping(null);
      } catch {
        setIgMapping(null);
      } finally {
        setIgMappingLoading(false);
      }
    };
    loadMapping();
  }, [activePersona?.num, integrationsOpen]);

  // (제거) 인사이트 폴링은 대시보드에서만 수행
  // Fetch a lightweight insights overview to get followers_count only when IG is linked
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!activePersona?.num || !igMapping?.ig_user_id) { setFollowerCount(null); return; }
      try {
        const r = await fetch(`${API_BASE}/api/instagram/insights/overview?persona_num=${activePersona.num}&days=7`, { credentials: 'include' });
        if (!r.ok) { setFollowerCount(null); return; }
        const data = await r.json();
        if (!alive) return;
        setFollowerCount(data?.followers_count ?? null);
      } catch {
        setFollowerCount(null);
      }
    })();
    return () => { alive = false; };
  }, [activePersona?.num, igMapping?.ig_user_id]);

  const linkPersonaToIG = async (account) => {
    if (!activePersona?.num) {
      alert("먼저 프로필을 선택하세요.");
      return;
    }
    try {
      const url = `${API_BASE}/oauth/instagram/link?persona_num=${activePersona.num}&ig_user_id=${encodeURIComponent(account.ig_user_id)}&fb_page_id=${encodeURIComponent(account.page_id)}&ig_username=${encodeURIComponent(account.ig_username || "")}`;
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      alert("이 페르소나와 인스타 계정이 연결되었습니다.");
      // Update mapping immediately
      setIgMapping({
        user_id: null,
        user_persona_num: activePersona.num,
        ig_user_id: account.ig_user_id,
        ig_username: account.ig_username,
        fb_page_id: account.page_id,
      });
    } catch (e) {
      alert(`연결 실패: ${e?.message || e}`);
    }
  };

  // removed unused posts placeholder

  // Load Instagram posts when Posts tab active or persona changes
  useEffect(() => {
    const load = async () => {
      if (tab !== "posts") return;
      if (!activePersona?.num) return;
      setInstaLoading(true);
      setInstaError(null);
      try {
  const res = await fetch(`${API_BASE}/api/instagram/posts?persona_num=${activePersona.num}&limit=18`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setInstaPosts(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        setInstaPosts([]);
        setInstaError(e?.message || String(e));
      } finally {
        setInstaLoading(false);
      }
    };
    load();
  }, [tab, activePersona?.num]);

  // Load chat images gallery when Photos tab is active or persona changes
  useEffect(() => {
    const load = async () => {
      if (tab !== "photos") return;
      if (!activePersona?.num) return;
      setGalleryLoading(true);
      setGalleryError(null);
      try {
        const res = await fetch(`${API_BASE}/api/chat/gallery?persona_num=${activePersona.num}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setGallery(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        setGallery([]);
        setGalleryError(e?.message || String(e));
      } finally {
        setGalleryLoading(false);
      }
    };
    load();
  }, [tab, activePersona?.num]);

  return (
    <main className="w-full min-h-screen bg-[#eaf5ff]">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <HeaderSummary
          credit={credit}
          creditMax={creditMax}
          personaName={activePersona?.name}
          personaImg={activePersona?.img}
          igLinked={!!igMapping}
          followerCount={followerCount}
          onOpenIntegrations={() => { setSelectorOpen(false); setIntegrationsOpen(true); }}
          onOpenProfileChange={() => { if (!integrationsOpen) setSelectorOpen(true); }}
          loadingPersona={loadingPersona}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
          <aside className="lg:col-span-4 space-y-6">
            <Card>
              <div className="text-sm text-slate-500">SNS 연동</div>
              <div className="mt-4 space-y-4">
                <ConnectRow
                  logo="IG"
                  name={igMapping ? `@${igMapping.ig_username || "연결됨"}` : "instagram"}
                  status={igMapping ? "연동됨" : (igMappingLoading ? "확인 중…" : "미연동")}
                  hint={igMapping ? "instagram" : "연동해주세요!"}
                />
              </div>
              <button
                className="btn primary mt-4 w-full"
                onClick={() => {
                  // Start OAuth with persona_num to get persona-scoped token
                  startInstagramOAuth();
                }}
              >
                인스타 연동 하기
              </button>
            </Card>

            <Card>
              <div className="text-sm text-slate-500">오늘의 할 일</div>
              <ul className="mt-3 space-y-2">
                {todos.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className={t.done ? "line-through text-slate-400" : ""}>{t.text}</span>
                  </li>
                ))}
              </ul>
              <button
                className="btn light mt-3 w-full"
                onClick={() => setTodos((prev) => prev.concat({ id: Date.now(), text: "새 할 일", done: false }))}
              >
                할 일 추가
              </button>
            </Card>
          </aside>

          <section className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-white/80 border border-slate-200 p-1 inline-flex shadow-sm">
                <TabButton active={tab === "photos"} onClick={() => setTab("photos")} label="사진" />
                <TabButton active={tab === "posts"} onClick={() => setTab("posts")} label="게시글" />
                <TabButton active={tab === "drafts"} onClick={() => setTab("drafts")} label="임시저장" />
              </div>
              <Link to="/dashboard" className="btn light">대시보드</Link>
            </div>

            {tab === "photos" && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-slate-500">갤러리 {Array.isArray(gallery) ? gallery.length : 0}장</div>
                  <button className="btn light" onClick={() => {
                    // manual refresh
                    setTab("photos");
                    // trigger effect
                    setGalleryLoading(true);
                    (async () => {
                      try {
                        const res = await fetch(`${API_BASE}/api/chat/gallery?persona_num=${activePersona?.num || ''}`, { credentials: "include" });
                        if (res.ok) {
                          const data = await res.json();
                          setGallery(Array.isArray(data?.items) ? data.items : []);
                        }
                      } finally { setGalleryLoading(false); }
                    })();
                  }}>새로고침</button>
                </div>
                {galleryLoading && <div className="text-sm text-slate-500">불러오는 중…</div>}
                {galleryError && <div className="text-sm text-red-600">갤러리를 불러오지 못했습니다: {galleryError}</div>}
                {!galleryLoading && !galleryError && Array.isArray(gallery) && gallery.length === 0 && (
                  <Empty title="아직 생성된 이미지가 없어요" action="새로 만들기" />
                )}
                {!galleryLoading && !galleryError && Array.isArray(gallery) && gallery.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {gallery.map((g) => (
                      <div key={g.id || g.key} className="relative rounded-xl overflow-hidden border border-slate-200 bg-white/60">
                        {g.url ? (
                          <img src={g.url} alt="" className="w-full h-36 object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-36 bg-slate-100" />
                        )}
                        {g.created_at && (
                          <div className="absolute bottom-0 left-0 right-0 text-[10px] text-white/90 bg-black/30 px-2 py-1">
                            {new Date(g.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "drafts" && (
              <Card>
                <Empty title="아직 콘텐츠가 없어요" action="새로 만들기" />
              </Card>
            )}

            {tab === "posts" && (
              <>
                {/* Instagram posts (DB) */}
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-slate-500">인스타 게시글 {Array.isArray(instaPosts) ? instaPosts.length : 0}개</div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn light"
                        onClick={async () => {
                          if (!activePersona?.num) { setSelectorOpen(true); return; }
                          setInstaLoading(true);
                          try {
                            await fetch(`${API_BASE}/api/instagram/posts/sync?persona_num=${activePersona.num}&limit=18&days=30`, { method: 'POST', credentials: 'include' });
                            // ignore errors, then reload list
                          } catch (err) { console.debug('[MyPage] posts sync failed', err); }
                          try {
                            const r = await fetch(`${API_BASE}/api/instagram/posts?persona_num=${activePersona.num}&limit=18`, { credentials: 'include' });
                            if (r.ok) {
                              const data = await r.json();
                              setInstaPosts(Array.isArray(data?.items) ? data.items : []);
                            }
                          } finally { setInstaLoading(false); }
                        }}
                      >동기화</button>
                      <button className="btn" onClick={async () => {
                        if (!activePersona?.num) { setSelectorOpen(true); return; }
                        setInstaLoading(true);
                        try {
                          const r = await fetch(`${API_BASE}/api/instagram/posts?persona_num=${activePersona.num}&limit=18`, { credentials: 'include' });
                          if (r.ok) {
                            const data = await r.json();
                            setInstaPosts(Array.isArray(data?.items) ? data.items : []);
                          }
                        } finally { setInstaLoading(false); }
                      }}>새로고침</button>
                    </div>
                  </div>
                  {instaLoading && <div className="text-sm text-slate-500">불러오는 중…</div>}
                  {instaError && <div className="text-sm text-red-600">게시글을 불러오지 못했습니다: {instaError}</div>}
                  {!instaLoading && !instaError && Array.isArray(instaPosts) && instaPosts.length === 0 && (
                    <Empty title="연동된 인스타 게시글이 없어요" action="동기화" />
                  )}
                  {!instaLoading && !instaError && Array.isArray(instaPosts) && instaPosts.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {instaPosts.map((p) => (
                        <a key={p.id} href={p.permalink || '#'} target="_blank" rel="noreferrer" className="block group relative rounded-xl overflow-hidden border border-slate-200 bg-white/60">
                          {p.media_type === 'VIDEO' && p.thumbnail_url ? (
                            <img src={p.thumbnail_url} alt="" className="w-full h-36 object-cover" loading="lazy" />
                          ) : p.media_url ? (
                            <img src={p.media_url} alt="" className="w-full h-36 object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-36 bg-slate-100" />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                          <div className="absolute bottom-0 left-0 right-0 text-[10px] text-white/90 bg-black/30 px-2 py-1 flex items-center justify-between gap-2">
                            <span>{p.timestamp ? new Date(p.timestamp).toLocaleString() : ''}</span>
                            <span>❤ {fmtNum(p.like_count)} · 💬 {fmtNum(p.comments_count)}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Integrations modal */}
      {integrationsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white/90 backdrop-blur shadow-[0_30px_70px_rgba(2,6,23,0.28)] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b">
              <div className="font-semibold">연동 관리</div>
              <button className="btn" onClick={() => setIntegrationsOpen(false)}>닫기</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white/70 p-4">
                <div className="flex items-center gap-3 mb-3 justify-center">
                  <div className="w-8 h-8 rounded-full bg-black text-white text-[10px] grid place-items-center">IG</div>
                  <div className="text-center">
                    <div className="font-semibold">Instagram 계정 연동</div>
                    <div className="text-xs text-slate-500">현재 페르소나와 연동할 페이지/계정을 선택하세요.</div>
                  </div>
                </div>
                {igLoading && <div className="text-sm text-slate-500">계정 불러오는 중…</div>}
                {igError && (
                  <div className="text-sm text-red-600">
                    계정 조회 실패: {igError}
                    <div className="mt-2 text-slate-600">토큰 만료나 권한 미부여일 수 있어요. 아래 ‘다시 인증’으로 Meta 로그인부터 다시 진행해 주세요.</div>
                  </div>
                )}
                {!igLoading && igAccountsPersonaNum === activePersona?.num && !igError && Array.isArray(igAccounts) && igAccounts.length === 0 && (
                  <div className="text-sm text-slate-500">연결 가능한 Instagram 비즈니스 계정을 찾지 못했습니다.</div>
                )}
                {!igLoading && igAccountsPersonaNum === activePersona?.num && !igError && Array.isArray(igAccounts) && igAccounts.length > 0 && (
                  <div className="grid gap-3">
                    {igAccounts.map((acc) => (
                      <div key={`${acc.page_id}-${acc.ig_user_id}`} className="rounded-lg border border-slate-200 bg-white/80 p-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{acc.page_name} <span className="text-slate-400 text-xs">({acc.page_id})</span></div>
                          <div className="text-xs text-slate-600">IG: @{acc.ig_username} <span className="text-slate-400">[{acc.ig_user_id}]</span></div>
                        </div>
                        <button className="btn primary" disabled={igAccountsPersonaNum !== activePersona?.num} onClick={() => linkPersonaToIG(acc)}>
                          {activePersona?.name ? `${activePersona.name}에 연결` : "현재 페르소나에 연결"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs text-slate-500 text-center">
                  토큰이 만료되었거나 계정이 보이지 않으면 Meta OAuth를 다시 진행하세요.
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button className="btn light" onClick={startInstagramOAuth}>다시 인증</button>
                    <button className="btn" onClick={unlinkAndReauth}>연결 해제 후 재연동</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MyPage local profile change modal */}
      {selectorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectorOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 backdrop-blur shadow-[0_30px_70px_rgba(2,6,23,0.28)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b">
              <div className="font-semibold">프로필 교체하기</div>
              <button className="btn" onClick={() => setSelectorOpen(false)}>닫기</button>
            </div>
            <div className="p-5">
              {loadingPersona ? (
                <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
              ) : (
                <ul className="divide-y">
                  {Array.isArray(personas) && personas.length > 0 ? (
                    personas.map((p) => (
                      <li key={p.num}>
                        <button
                          className="w-full flex items-center gap-3 px-2 py-2 hover:bg-slate-50"
                          onClick={() => choosePersona(p)}
                        >
                          {p.img ? (
                            <img src={p.img} alt="" className="w-9 h-9 rounded-full object-cover border" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-200" />
                          )}
                          <div className="flex-1 text-left text-sm font-semibold">{p.name || `프로필 ${p.num}`}</div>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-slate-500 px-2 py-3">프로필이 없습니다.</li>
                  )}
                </ul>
              )}
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  className="btn light"
                  onClick={() => {
                    setSelectorOpen(false);
                    try { window.dispatchEvent(new CustomEvent("open-imgcreate")); } catch (err) { console.debug('[MyPage] dispatch open-imgcreate failed', err); }
                  }}
                >
                  새 프로필 만들기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}          

function HeaderSummary({ credit, creditMax, personaName, personaImg, igLinked, followerCount, onOpenIntegrations, onOpenProfileChange, loadingPersona }) {
  const pct = Math.min(100, Math.round((credit / creditMax) * 100));
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 backdrop-blur p-6 shadow-[0_10px_30px_rgba(30,64,175,0.08)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-50 h-50 rounded-full overflow-hidden border border-slate-200 bg-white">
            {/* 기본 이미지 대신 빈 값 처리: 이미지가 없으면 숨김 */}
            {personaImg ? (
              <img src={personaImg} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-100" />
            )}
            <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">온라인</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold">{personaName || (loadingPersona ? "로딩 중…" : "프로필 없음")}</div>
            </div>
            <div className="text-sm text-slate-500">마이페이지에서 활동 프로필을 관리하세요.</div>
            <div className="mt-2 flex gap-6 text-sm">
              <Stat label="팔로워" value={igLinked ? fmtNum(followerCount) : "-"} />
              <Stat label="참여율" value="-" />
              <Stat label="주간도달" value="-" />
            </div>
          </div>
        </div>

        <div className="w-full md:w-80">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>크레딧</span>
            <span>{credit} / {creditMax}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-linear-to-r from-blue-400 to-indigo-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn primary grow" onClick={onOpenProfileChange}>프로필 교체하기</button>
            <button className="btn light" onClick={onOpenIntegrations}>연동관리</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ConnectRow({ logo, name, status, hint }) {
  const linked = status === "연동됨";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1">
        <div className="w-7 h-7 rounded-full bg-black text-white text-[10px] flex items-center justify-center">{logo}</div>
        <div className="flex flex-col items-center flex-1">
          <div className="text-slate-800 text-sm text-center">{name}</div>
          <div className="text-[11px] text-slate-400 text-center">{hint}</div>
        </div>
      </div>
      {linked ? (
        <span className="btn-soft-primary text-[10px] px-2 py-0.5">{status}</span>
      ) : (
        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">{status}</span>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-10 rounded-full text-sm ${active ? "bg-blue-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white/80 backdrop-blur p-6 shadow-[0_10px_30px_rgba(30,64,175,0.08)] ${className}`}>
      {children}
    </div>
  );
}

function Empty({ title, action }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto w-20 h-18.5 rounded-2xl bg-slate-100" />
      <div className="mt-4 text-slate-700 font-semibold">{title}</div>
      <button className="btn primary mt-4">{action}</button>
    </div>
  );
}

// ===== Number formatting helper =====
function fmtNum(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return String(n);
}
// Removed unused badgeTone, trend/sparkline helpers
