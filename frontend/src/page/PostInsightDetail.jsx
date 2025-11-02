import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "@/api/client";

export default function PostInsightDetail(){
  const { id } = useParams();
  const [item,setItem]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  useEffect(()=>{
    let alive=true;
    (async()=>{
      setLoading(true); setError(null);
      try{
        const personaNum = Number(localStorage.getItem('activePersonaNum')||'0');
  const r = await fetch(`${API_BASE}/api/instagram/insights/media_detail?persona_num=${personaNum}&media_id=${encodeURIComponent(id)}`, { credentials:'include' });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if(alive) setItem(j?.item || null);
      }catch(e){ if(alive) setError(e?.message || '로드 실패'); }
      finally{ if(alive) setLoading(false); }
    })();
    return ()=>{ alive=false; };
  },[id]);

  return (
    <div className="min-h-screen bg-[#eaf5ff]">
      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <Link to="/dashboard/post-insights" className="btn light">← 게시글 인사이트</Link>
          <div className="flex items-center gap-2">
            <a href={item?.permalink} target="_blank" rel="noreferrer" className="btn light">원본 보기</a>
          </div>
        </div>
        {loading? (
          <div className="h-[60vh] rounded-2xl bg-slate-100 animate-pulse" />
        ) : error? (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {String(error)}
            {(String(error).includes('HTTP 401') || String(error).includes('401')) && (
              <div className="mt-2 text-slate-700">인스타그램 연동이 필요하거나 인증이 만료되었습니다. 마이페이지에서 계정을 연동해 주세요.</div>
            )}
          </div>
        ) : item? (
          <div className="rounded-2xl border bg-white p-4 grid md:grid-cols-2 gap-4">
            <div>
              <img src={item.media_url || item.thumbnail_url} alt="" className="w-full rounded-xl object-cover border" />
              <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
                <span>{fmtDate(item.timestamp)}</span>
                <span className="inline-flex items-center px-1.5 py-[1px] rounded bg-slate-100 border text-[10px]">{(item.media_product_type || item.media_type) || ''}</span>
                <span className="inline-flex items-center px-1.5 py-[1px] rounded bg-slate-100 border text-[10px]">ID: {item.id}</span>
              </div>
              <div className="text-sm mt-1 whitespace-pre-wrap wrap-break-word">{item.caption}</div>
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-bold">인사이트</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {renderMetrics(item)}
                <div className="px-3 py-2 rounded border bg-slate-50">좋아요 · {fmtNum(item.like_count)}</div>
                <div className="px-3 py-2 rounded border bg-slate-50">댓글 · {fmtNum(item.comments_count)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function renderMetrics(it){
  const ins = it?.insights || {};
  const rows = [];
  if('plays' in ins){
    rows.push(['재생', ins.plays], ['도달', ins.reach], ['공유', ins.shares], ['저장', ins.saves], ['총상호작용', ins.total_interactions]);
  }else{
    rows.push(['노출', ins.impressions], ['도달', ins.reach], ['저장', ins.saved], ['참여', ins.engagement], ['비디오조회', ins.video_views]);
  }
  return rows.map(([k,v])=> (<div key={k} className="px-3 py-2 rounded border bg-slate-50">{k} · {fmtNum(v)}</div>));
}

function fmtDate(s){ try{ return new Date(s).toLocaleString(); }catch{ return s||''; } }
function fmtNum(v){ const n=Number(v||0); if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
