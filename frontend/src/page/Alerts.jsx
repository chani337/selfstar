import { useEffect, useState } from "react";

// API base: prefer Vite proxy; fallback to empty string
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env)
  ? (import.meta.env.VITE_API_BASE ?? '')
  : '';

function formatTime(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts || '';
    return d.toLocaleString();
  } catch {
    return ts || '';
  }
}

export default function Alerts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ ok: true, personas: [] });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sending, setSending] = useState(null); // comment_id currently being processed
  const [draft, setDraft] = useState(null); // { persona_num, comment_id, reply, posting }
  const [bulk, setBulk] = useState(null); // { persona_num, entries:[{comment_id,text,media,reply,status,error}], posting }

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/instagram/comments/overview?media_limit=5&comments_limit=8`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 401) {
        throw new Error('로그인이 필요합니다.');
      }
      if (!res.ok) {
        throw new Error(`요청 실패: HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json || { ok: false, personas: [] });
      setLastUpdated(new Date());
    } catch (e) {
      setError(e?.message || '네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleAutoReply = async ({ persona_num, comment_id, text, media }) => {
    // 1) 드래프트 생성만 먼저 수행 (AI 호출만, Graph 포스트는 하지 않음)
    setSending(comment_id);
    try {
      const post_img = media?.thumbnail_url || media?.media_url || null;
      const post = media?.caption || null;
      const r = await fetch(`${API_BASE}/api/instagram/comments/auto_draft`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_num, text, post_img, post }),
      });
      if (r.status === 401) throw new Error('로그인이 필요합니다.');
      if (!r.ok) throw new Error(`초안 생성 실패: HTTP ${r.status}`);
      const j = await r.json();
      const reply = (j?.reply ?? '').trim();
      if (!reply) throw new Error('빈 답변이 생성되었습니다.');
      setDraft({ persona_num, comment_id, reply, posting: false });
    } catch (e) {
      alert(e?.message || '자동 답글 초안 생성 중 오류가 발생했습니다.');
    } finally {
      setSending(null);
    }
  };

  const confirmDraft = async () => {
    if (!draft) return;
    try {
      setDraft((d) => ({ ...d, posting: true }));
      const r = await fetch(`${API_BASE}/api/instagram/comments/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_num: draft.persona_num, comment_id: draft.comment_id, message: draft.reply }),
      });
      if (r.status === 401) throw new Error('로그인이 필요합니다.');
      if (!r.ok) throw new Error(`답글 실패: HTTP ${r.status}`);
      setDraft(null);
      await fetchOverview();
    } catch (e) {
      alert(e?.message || '답글 등록 중 오류가 발생했습니다.');
      setDraft((d) => (d ? { ...d, posting: false } : d));
    }
  };

  const cancelDraft = () => setDraft(null);

  // Bulk flow: draft for all comments in a persona, preview, then confirm to post all
  const handleBulkDraft = async (persona) => {
    const persona_num = persona?.persona_num;
    const items = persona?.items || [];
    const entries = [];
    for (const m of items) {
      const comments = m?.comments || [];
      for (const c of comments) {
        entries.push({ comment_id: c.id, text: c.text, media: m, reply: '', status: 'drafting', error: null });
      }
    }
    if (entries.length === 0) {
      alert('일괄 생성할 댓글이 없습니다.');
      return;
    }
    setBulk({ persona_num, entries, posting: false });
    // draft sequentially for stability
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const post_img = e.media?.thumbnail_url || e.media?.media_url || null;
        const post = e.media?.caption || null;
        const r = await fetch(`${API_BASE}/api/instagram/comments/auto_draft`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona_num, text: e.text, post_img, post }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const reply = (j?.reply ?? '').trim();
        setBulk((prev) => {
          if (!prev) return prev;
          const copy = { ...prev, entries: prev.entries.slice() };
          copy.entries[i] = { ...copy.entries[i], reply, status: reply ? 'ready' : 'error', error: reply ? null : '빈 답변' };
          return copy;
        });
      } catch (err) {
        setBulk((prev) => {
          if (!prev) return prev;
          const copy = { ...prev, entries: prev.entries.slice() };
          copy.entries[i] = { ...copy.entries[i], status: 'error', error: err?.message || 'draft 실패' };
          return copy;
        });
      }
    }
  };

  const confirmBulk = async () => {
    if (!bulk) return;
    setBulk((b) => b ? { ...b, posting: true, entries: b.entries.map((e) => (e.status === 'ready' ? { ...e, status: 'posting' } : e)) } : b);
    const persona_num = bulk.persona_num;
    // Prepare single bulk payload
    const items = bulk.entries.filter((e) => e.status === 'ready').map((e) => ({ comment_id: e.comment_id, message: e.reply }));
    try {
      const r = await fetch(`${API_BASE}/api/instagram/comments/reply_bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_num, items }),
      });
      const jr = await r.json().catch(() => ({}));
      if (!r.ok || !jr?.ok) throw new Error(`HTTP ${r.status}`);
      const results = jr.results || [];
      // Map results back to entries
      setBulk((prev) => {
        if (!prev) return prev;
        const map = new Map(results.map((x) => [x.comment_id, x]));
        const copy = { ...prev, entries: prev.entries.slice() };
        copy.entries = copy.entries.map((e) => {
          const res = map.get(e.comment_id);
          if (!res) return e;
          if (res.ok) return { ...e, status: 'done' };
          return { ...e, status: 'error', error: res.error || `HTTP ${res.status}` };
        });
        return copy;
      });
    } catch (err) {
      // On bulk error, mark all posting entries as error
      setBulk((prev) => prev ? { ...prev, entries: prev.entries.map((e) => e.status === 'posting' ? { ...e, status: 'error', error: err?.message || 'bulk 실패' } : e) } : prev);
    }
    // refresh and close
    await fetchOverview();
    setBulk(null);
  };

  const cancelBulk = () => setBulk(null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black">알림</h2>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {lastUpdated && (
            <span>업데이트: {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={fetchOverview}
            className="px-3 py-1.5 rounded-full border bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-slate-500">불러오는 중…</div>
      )}
      {error && (
        <div className="text-red-600">{error}</div>
      )}

      {!loading && !error && (!data?.personas || data.personas.length === 0) && (
        <div className="text-slate-500">연동된 프로필이 없거나 댓글이 없습니다.</div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {data?.personas?.map((p) => (
          <PersonaCard key={p.persona_num} persona={p} onAutoReply={handleAutoReply} onBulkDraft={handleBulkDraft} sending={sending} />
        ))}
      </div>

      {/* Draft confirm modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[520px] max-w-[92vw] rounded-2xl bg-white shadow-xl border">
            <div className="p-5 border-b">
              <div className="text-lg font-semibold">자동 생성된 답글</div>
              <div className="mt-2 text-sm text-slate-500">이대로 답글을 달까요?</div>
            </div>
            <div className="p-5">
              <div className="rounded-lg border bg-slate-50 p-4 text-slate-800 whitespace-pre-wrap break-words">
                {draft.reply}
              </div>
            </div>
            <div className="p-4 flex items-center justify-end gap-3 border-t">
              <button onClick={cancelDraft} className="px-3 py-1.5 rounded-full border bg-white hover:bg-slate-50 text-slate-700" disabled={draft.posting}>아니오</button>
              <button onClick={confirmDraft} className="px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" disabled={draft.posting}>
                {draft.posting ? '등록 중…' : '예'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk draft modal */}
      {bulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[760px] max-w-[96vw] rounded-2xl bg-white shadow-xl border max-h-[88vh] flex flex-col">
            <div className="p-5 border-b">
              <div className="text-lg font-semibold">한번에 답장 미리보기</div>
              <div className="mt-2 text-sm text-slate-500">각 댓글에 생성된 답글을 확인하세요.</div>
            </div>
            <div className="p-5 overflow-auto">
              <div className="space-y-4">
                {bulk.entries.map((e) => (
                  <div key={e.comment_id} className="rounded-lg border p-3">
                    <div className="text-xs text-slate-500 mb-1">댓글</div>
                    <div className="text-sm text-slate-800 break-words mb-2">{e.text}</div>
                    <div className="text-xs text-slate-500 mb-1">생성된 답글</div>
                    {e.status === 'drafting' && <div className="text-slate-500 text-sm">생성 중…</div>}
                    {e.status === 'error' && <div className="text-red-600 text-sm">오류: {e.error}</div>}
                    {e.status !== 'drafting' && e.status !== 'error' && (
                      <div className="text-sm text-slate-900 whitespace-pre-wrap break-words">{e.reply}</div>
                    )}
                    {e.status === 'posting' && <div className="mt-2 text-xs text-blue-600">등록 중…</div>}
                    {e.status === 'done' && <div className="mt-2 text-xs text-green-600">등록 완료</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 flex items-center justify-end gap-3 border-t">
              <button onClick={cancelBulk} className="px-3 py-1.5 rounded-full border bg-white hover:bg-slate-50 text-slate-700" disabled={bulk.posting}>취소</button>
              <button onClick={confirmBulk} className="px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" disabled={bulk.posting}>
                {bulk.posting ? '등록 중…' : '모두 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonaCard({ persona, onAutoReply, onBulkDraft, sending }) {
  const { persona_name, persona_img, ig_username, items = [] } = persona;
  const persona_num = persona.persona_num;

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b bg-slate-50/60">
        {persona_img ? (
          <img src={persona_img} alt="persona" className="w-9 h-9 rounded-full object-cover border" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-200" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{persona_name || '프로필'}</div>
          <div className="text-xs text-slate-500 truncate">@{ig_username || '연동안됨'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-soft-primary text-xs px-3 py-1.5 disabled:opacity-60 whitespace-nowrap"
            title="이 프로필의 모든 댓글에 자동 답장을 한 번에 생성하고 등록합니다"
            onClick={() => onBulkDraft?.(persona)}
          >
            한번에 답장
          </button>
        </div>
      </div>

      <div className="p-4">
        {(!items || items.length === 0) ? (
          <div className="text-sm text-slate-500">표시할 댓글이 없습니다.</div>
        ) : (
          <div className="space-y-5">
            {items.map((m) => (
              <MediaBlock key={m.media_id} media={m} persona_num={persona_num} onAutoReply={onAutoReply} sending={sending} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaBlock({ media, persona_num, onAutoReply, sending }) {
  const thumb = media.thumbnail_url || media.media_url;
  const comments = media.comments || [];
  return (
    <div className="rounded-xl border bg-white/60">
      {/* 미디어 헤더: 캡션과 썸네일, 링크 */}
      <div className="grid grid-cols-12 gap-3 p-3 border-b items-center">
        <div className="col-span-9 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate" title={media.caption || ''}>
            {media.caption || '(캡션 없음)'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{formatTime(media.timestamp)}</div>
          {media.permalink && (
            <a href={media.permalink} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs text-blue-600 hover:underline">
              원본 게시글 열기
            </a>
          )}
        </div>
        <div className="col-span-3">
          {thumb ? (
            <img
              src={thumb}
              alt="post"
              className="ml-auto w-16 h-16 rounded-md object-cover border shadow-sm"
            />
          ) : (
            <div className="ml-auto w-16 h-16 rounded-md bg-slate-200" />)
          }
        </div>
      </div>
      {/* 댓글 목록 */}
      <div className="divide-y">
        {comments.length === 0 ? (
          <div className="text-sm text-slate-500 p-3">이 게시글에 표시할 댓글이 없습니다.</div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="p-3 grid grid-cols-12 gap-2 items-start">
              <div className="col-span-2 text-sm font-semibold truncate">{c.username || '사용자'}</div>
              <div className="col-span-8 text-sm text-slate-700 wrap-break-word" title={c.text}>{c.text}</div>
              <div className="col-span-2 text-xs text-slate-500 text-right flex flex-col items-end gap-2">
                <div>{formatTime(c.timestamp)}</div>
                <button
                  className="btn-soft-primary text-[11px] px-2.5 py-1.5 disabled:opacity-60 whitespace-nowrap"
                  onClick={() => onAutoReply?.({ persona_num, comment_id: c.id, text: c.text, media })}
                  disabled={sending === c.id}
                  title="AI 기본 응답으로 자동 답글"
                >
                  {sending === c.id ? '응답 중…' : '자동 답글'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
