import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "@/api/client";

export default function ManageProfiles({ embedded = false, onClose, onRequestCreateNew }) {
  const [items, setItems] = useState([]); // [{num, name, img}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { num, name }
  const [deleting, setDeleting] = useState(null); // persona to delete
  const nav = useNavigate();

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/personas/me`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.items) ? data.items : [];
      list.sort((a,b)=> (a.num||0)-(b.num||0));
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onEdit = (p) => setEditing({ num: p.num, name: p.name || "" });
  const onDelete = (p) => setDeleting(p);

  const submitEdit = async () => {
    if (!editing) return;
    try {
      // 1) 이름 패치
      const name = (editing.name || "").trim();
      if (name) {
        await fetch(`${API_BASE}/api/personas/${editing.num}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      setEditing(null);
      await load();
    } catch (e) {
      alert(`수정에 실패했습니다: ${e?.message || e}`);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API_BASE}/api/personas/${deleting.num}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 로컬 선택값 정리
      try { if (String(localStorage.getItem("activePersonaNum")) === String(deleting.num)) localStorage.removeItem("activePersonaNum"); } catch {}
      setDeleting(null);
      await load();
    } catch (e) {
      alert(`삭제에 실패했습니다: ${e?.message || e}`);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-7">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">프로필 관리</h1>
        <div className="flex gap-2">
          {embedded ? (
            <>
              <button className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50" onClick={() => onClose?.()}>닫기</button>
              <button className="px-3 py-2 rounded-lg border bg-blue-600 text-white" onClick={() => {
                onRequestCreateNew?.();
                // 전역 모달을 사용하는 환경에서는 App이 이미지 생성 모달을 열어줍니다
                try { window.dispatchEvent(new CustomEvent('open-imgcreate')); } catch {}
              }}>새 프로필 만들기</button>
            </>
          ) : (
            <>
              <Link to="/profiles" className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50">프로필 선택으로</Link>
              <Link to="/imgcreate" className="px-3 py-2 rounded-lg border bg-blue-600 text-white">새 프로필 만들기</Link>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div>불러오는 중…</div>
      ) : error ? (
        <div className="text-red-600">오류: {error}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.num} className="rounded-2xl border bg-white/70 overflow-hidden shadow-sm">
              <div className="aspect-[4/5] w-full bg-slate-100">
                {p.img ? (
                  <img src={p.img} alt="persona" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-500">이미지 없음</div>
                )}
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="font-semibold truncate">{p.name || `프로필 ${p.num}`}</div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 rounded border hover:bg-slate-50" onClick={() => onEdit(p)}>이름 수정</button>
                  <button className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50" onClick={() => onDelete(p)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-50" onClick={() => setEditing(null)}>
          <div className="w-[min(480px,92vw)] rounded-2xl border bg-white p-4 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-2">이름 수정</h2>
            <div className="space-y-3">
              <label className="block">
                <div className="text-sm text-slate-600 mb-1">이름</div>
                <input value={editing.name} onChange={(e)=>setEditing(v=>({...v, name:e.target.value}))} className="w-full h-11 rounded-xl border px-3" placeholder="프로필 이름" />
              </label>
              <div className="text-xs text-slate-500">이미지를 바꾸려면 새 프로필을 만들어주세요. 기존 프로필은 그대로 유지됩니다.</div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="px-3 py-2 rounded-lg border" onClick={()=>setEditing(null)}>취소</button>
                <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={submitEdit}>저장</button>
              </div>
              <div className="flex justify-between items-center mt-2">
                <div className="text-sm text-slate-600">새 프로필 만들기</div>
                <button
                  className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
                  onClick={() => {
                    setEditing(null);
                    if (embedded) {
                      onRequestCreateNew?.();
                    } else {
                      nav('/imgcreate');
                    }
                    try { window.dispatchEvent(new CustomEvent('open-imgcreate')); } catch {}
                  }}
                >
                  이미지로 새로 만들기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-50" onClick={()=>setDeleting(null)}>
          <div className="w-[min(420px,92vw)] rounded-2xl border bg-white p-4 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-2">삭제하시겠어요?</h2>
            <p className="text-slate-600 mb-3">이 작업은 되돌릴 수 없습니다. (인스타 연동 토큰 등 관련 데이터도 함께 정리됩니다)</p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border" onClick={()=>setDeleting(null)}>취소</button>
              <button className="px-3 py-2 rounded-lg bg-red-600 text-white" onClick={confirmDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

