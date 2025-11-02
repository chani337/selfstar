import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "@/api/client";
import PersonaQuickPicker from "@/components/PersonaQuickPicker.jsx";

export default function DashboardPostInsights(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [syncing,setSyncing]=useState(false);
  const [days,setDays]=useState(30);
  const [limit,setLimit]=useState(18);
  const [sortKey,setSortKey]=useState('date_desc');
  const [sortDir,setSortDir]=useState('desc');
  const [filterType,setFilterType]=useState('ALL'); // ALL | REEL | FEED
  const navigate = useNavigate();
  const load = async ()=>{
    setLoading(true); setError(null);
    try{
      const personaNum = Number(localStorage.getItem('activePersonaNum')||'0');
      const r = await fetch(`${API_BASE}/api/instagram/insights/media_overview?persona_num=${personaNum}&limit=${limit}&days=${days}`, { credentials:'include' });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setItems(Array.isArray(j?.items)? j.items:[]);
    }catch(e){ setError(e?.message||'로드 실패'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[days,limit]);

  const productKind = (m)=>{
    const t = (m.media_product_type || m.media_type || '').toUpperCase();
    return t.includes('REEL') ? 'REEL' : 'FEED';
  };

  const metric = (m, key)=>{
    const ins = m?.insights || {};
    if(key==='likes') return Number(m?.like_count||0);
    if(key==='comments') return Number(m?.comments_count||0);
    if(key==='reach') return Number(ins?.reach||0);
    if(key==='impressions_or_plays'){
      if('plays' in ins) return Number(ins?.plays||0);
      return Number(ins?.impressions||0);
    }
    if(key==='saves'){
      if('saves' in ins) return Number(ins?.saves||0);
      return Number(ins?.saved||0);
    }
    if(key==='date') return new Date(m?.timestamp||0).getTime();
    return 0;
  };

  const filtered = items.filter(m=>{
    if(filterType==='ALL') return true;
    return productKind(m)===filterType;
  });

  const sorted = [...filtered].sort((a,b)=>{
    const k = sortKey==='date_desc'||sortKey==='date_asc' ? 'date' : sortKey;
    const av = metric(a,k); const bv = metric(b,k);
    const dir = (sortKey==='date_desc' || sortDir==='desc') ? -1 : 1;
    if(av===bv) return 0; return av>bv? dir : -dir;
  });

  const totals = (()=>{
    let likes=0, comments=0, reel={plays:0, reach:0, saves:0}, feed={impressions:0, reach:0, saved:0};
    for(const m of filtered){
      likes += Number(m?.like_count||0);
      comments += Number(m?.comments_count||0);
      const ins = m?.insights||{};
      if(productKind(m)==='REEL'){
        reel.plays += Number(ins?.plays||0);
        reel.reach += Number(ins?.reach||0);
        reel.saves += Number(ins?.saves||0);
      }else{
        feed.impressions += Number(ins?.impressions||0);
        feed.reach += Number(ins?.reach||0);
        feed.saved += Number(ins?.saved||0);
      }
    }
    return {likes, comments, reel, feed, count: filtered.length};
  })();

  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black">게시글 인사이트</h2>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <PersonaQuickPicker buttonLabel="프로필 선택" to="/dashboard" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select className="h-9 px-2 rounded border bg-white text-sm" value={days} onChange={(e)=> setDays(Number(e.target.value)||30)}>
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
            </select>
            <select className="h-9 px-2 rounded border bg-white text-sm" value={filterType} onChange={(e)=> setFilterType(e.target.value)}>
              <option value="ALL">전체</option>
              <option value="REEL">릴스</option>
              <option value="FEED">피드</option>
            </select>
            <select className="h-9 px-2 rounded border bg-white text-sm" value={sortKey} onChange={(e)=> setSortKey(e.target.value)}>
              <option value="date_desc">최신순</option>
              <option value="date_asc">오래된순</option>
              <option value="likes">좋아요순</option>
              <option value="comments">댓글순</option>
              <option value="reach">도달순</option>
              <option value="impressions_or_plays">노출/재생순</option>
              <option value="saves">저장순</option>
            </select>
            <button
              className="btn light"
              onClick={()=>{
                // Export CSV of current filtered+sorted list
                const headers = [
                  'id','timestamp','type','caption','permalink','like_count','comments_count','plays','reach','saves','shares','total_interactions','impressions','saved','engagement','video_views'
                ];
                const rows = sorted.map(m=>{
                  const ins = m?.insights||{};
                  const type = productKind(m);
                  const fields = [
                    m.id, m.timestamp, type, (m.caption||'').replaceAll('\n',' '), m.permalink,
                    m.like_count, m.comments_count,
                    ins.plays??'', ins.reach??'', ins.saves??'', ins.shares??'', ins.total_interactions??'',
                    ins.impressions??'', ins.saved??'', ins.engagement??'', ins.video_views??''
                  ];
                  return fields.map(v=> typeof v==='string' && v.includes(',') ? '"'+v.replaceAll('"','""')+'"' : v).join(',');
                });
                const csv = [headers.join(','), ...rows].join('\n');
                const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `post_insights_${new Date().toISOString().slice(0,10)}.csv`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >CSV 내보내기</button>
            <button
              className={`btn ${syncing? 'light':''}`}
              onClick={async ()=>{
                setSyncing(true);
                try{
                  const personaNum = Number(localStorage.getItem('activePersonaNum')||'0');
                  await fetch(`${API_BASE}/api/instagram/insights/snapshot?persona_num=${personaNum}`, { method:'POST', credentials:'include' });
                }catch{}
                await load();
                setSyncing(false);
              }}
            >{syncing? '동기화 중…':'지금 동기화'}</button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SumCard label="포스트 수" value={fmtNum(totals.count)} />
          <SumCard label="총 좋아요" value={fmtNum(totals.likes)} />
          <SumCard label="총 댓글" value={fmtNum(totals.comments)} />
          <SumCard label={filterType==='REEL'?'총 재생':'총 노출'} value={fmtNum(filterType==='REEL'? totals.reel.plays : totals.feed.impressions)} />
        </div>
      )}
      {loading? (
        <div>
          <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          <div className="text-xs text-slate-500 mt-2">게시글 인사이트를 불러오는 중…</div>
        </div>
      ) : error? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {String(error)}
          {(String(error).includes('HTTP 401') || String(error).includes('401')) && (
            <div className="mt-2 text-slate-700">인스타그램 연동이 필요하거나 인증이 만료되었습니다. 마이페이지에서 계정을 연동해 주세요.</div>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(m=> (
            <button key={m.id} onClick={()=> navigate(`/dashboard/post-insights/${m.id}`)} className="text-left rounded-xl border bg-white/80 p-3 hover:shadow-sm">
              <div className="flex gap-3">
                <img src={m.preview_url} alt="" className="w-16 h-16 rounded-lg object-cover border" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>{fmtDate(m.timestamp)}</span>
                    <span className="inline-flex items-center px-1.5 py-[1px] rounded bg-slate-100 border text-[10px]">{(m.media_product_type||m.media_type)||''}</span>
                  </div>
                  <div className="text-sm font-semibold truncate">{truncate(m.caption, 40) || '제목 없음'}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {('plays' in (m.insights||{}))? (
                      <>재생 {fmtNum(m.insights?.plays)} · 도달 {fmtNum(m.insights?.reach)} · 저장 {fmtNum(m.insights?.saves)} · 좋아요 {fmtNum(m.like_count)} · 댓글 {fmtNum(m.comments_count)}</>
                    ):(
                      <>노출 {fmtNum(m.insights?.impressions)} · 도달 {fmtNum(m.insights?.reach)} · 저장 {fmtNum(m.insights?.saved)} · 좋아요 {fmtNum(m.like_count)} · 댓글 {fmtNum(m.comments_count)}</>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && !error && sorted.length>0 && items.length>=limit && (
        <div className="mt-4 text-center">
          <button className="btn" onClick={()=> setLimit(l=> l+18)}>더 불러오기</button>
        </div>
      )}
    </div>
  );
}

function fmtDate(s){ try{ return new Date(s).toLocaleDateString(); }catch{ return s||''; } }
function fmtNum(v){ const n=Number(v||0); if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function truncate(s,max){ if(!s) return s; return s.length>max? s.slice(0,max-1)+'…' : s; }

function SumCard({label, value}){
  return (
    <div className="rounded-xl border bg-white/80 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
