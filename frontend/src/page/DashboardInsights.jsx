import { useEffect, useMemo, useState } from "react";
// import { Link } from "react-router-dom";
import { API_BASE } from "@/api/client";
import PersonaQuickPicker from "@/components/PersonaQuickPicker.jsx";
import {
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

export default function DashboardInsights() {
  const [personas, setPersonas] = useState([]);
  const [persona, setPersona] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daily, setDaily] = useState(null); // { followers_delta:[], likes_delta:[] }
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaError, setMediaError] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 프로필 선택 모달에서 선택되면 반영 (PersonaQuickPicker가 window 이벤트를 쏨)
  useEffect(()=>{
    const handler = (e)=>{
      const picked = e?.detail;
      if(!picked) return;
      // personas가 로드된 뒤면 매칭, 아니면 num만 반영
      setPersona(prev=>{
        const cand = (personas || []).find(p=>p.num===picked.num);
        return cand || picked;
      });
    };
    window.addEventListener('persona-chosen', handler);
    return ()=> window.removeEventListener('persona-chosen', handler);
  }, [personas]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/personas/me`, { credentials: 'include' });
        if (!res.ok) return;
        const j = await res.json();
        const items = Array.isArray(j?.items) ? j.items : [];
        items.sort((a,b)=> (a.num||0)-(b.num||0));
        if (!alive) return;
        setPersonas(items);
        const saved = Number(localStorage.getItem('activePersonaNum') || 0);
        const pick = items.find(p=>p.num===saved) || items[0] || null;
        setPersona(pick);
      } catch (err) { console.debug('[Dashboard] load personas failed', err); }
    })();
    return ()=>{ alive=false; };
  }, []);

  const loadAll = async () => {
    const load = async () => {
      if (!persona?.num) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/instagram/insights/overview?persona_num=${persona.num}&days=30`, { credentials: 'include' });
        if (!res.ok) {
          // Friendly 401 messaging handled in render
          throw new Error(`HTTP ${res.status}`);
        }
        const j = await res.json();
        setData(j);
        // 일별 증가
        const d = await fetch(`${API_BASE}/api/instagram/insights/daily?persona_num=${persona.num}&days=30`, { credentials: 'include' });
        if (d.ok) setDaily(await d.json()); else setDaily(null);
        // 게시글별 인사이트
        setMediaLoading(true); setMediaError(null);
        const m = await fetch(`${API_BASE}/api/instagram/insights/media_overview?persona_num=${persona.num}&limit=12&days=30`, { credentials: 'include' });
        if (m.ok) {
          const mj = await m.json();
          setMediaItems(Array.isArray(mj?.items)? mj.items : []);
        } else {
          setMediaItems([]);
          setMediaError(`HTTP ${m.status}`);
        }
      } catch (e) {
        setError(e?.message || '로드 실패');
        setData(null);
        setDaily(null);
        setMediaItems([]);
        setMediaError(e?.message || '로드 실패');
      } finally { setLoading(false); }
    };
    await load();
  };

  useEffect(() => {
    loadAll();
  }, [persona?.num]);

  // ===== Transform series for charts (with aligned dates) =====
  const mergedFollowersProfile = useMemo(() => {
    const a = data?.series?.follower_count || [];
    const b = data?.series?.profile_views || [];
    const map = new Map();
    for (const it of a) map.set(it.date, { date: it.date, followers: Number(it.value) || 0 });
    for (const it of b) {
      const prev = map.get(it.date) || { date: it.date };
      map.set(it.date, { ...prev, profile_views: Number(it.value) || 0 });
    }
    return Array.from(map.values()).sort((x, y) => new Date(x.date) - new Date(y.date));
  }, [data?.series?.follower_count, data?.series?.profile_views]);

  const approxLikesByDay = useMemo(() => {
    return (data?.series?.approx_likes_by_post_day || []).map((d) => ({ date: d.date, value: Number(d.value) || 0 }));
  }, [data?.series?.approx_likes_by_post_day]);

  const followersDelta = useMemo(() => (daily?.followers_delta || []).map(d => ({ date: d.date, value: Number(d.value) || 0 })), [daily?.followers_delta]);
  const likesDelta = useMemo(() => (daily?.likes_delta || []).map(d => ({ date: d.date, value: Number(d.value) || 0 })), [daily?.likes_delta]);

  return (
    <div className="w-full space-y-6">
      {/* 헤더 카드 */}
  <div className="rounded-3xl border bg-linear-to-r from-blue-50 to-indigo-50 p-5 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Professional Dashboard</div>
          <h1 className="text-2xl font-black tracking-tight">인사이트</h1>
          <div className="text-xs text-slate-500 mt-1">최근 30일 데이터 기준</div>
        </div>
        <div className="flex items-center gap-2">
          {/* 드롭다운 제거, 버튼만 노출 */}
          <PersonaQuickPicker buttonLabel="프로필 선택" to="/dashboard" />
          <button
            className={`btn ${syncing ? 'light' : ''}`}
            onClick={async ()=>{
              if (!persona?.num) return;
              setSyncing(true);
              try {
                await fetch(`${API_BASE}/api/instagram/insights/snapshot?persona_num=${persona.num}`, { method:'POST', credentials:'include' });
              } catch {}
              await loadAll();
              setSyncing(false);
            }}
          >{syncing? '동기화 중…' : '지금 동기화'}</button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {String(error)}
          {(String(error).includes('HTTP 401') || String(error).includes('401')) && (
            <div className="mt-2 text-slate-700">
              인스타그램 연동이 필요하거나 인증이 만료되었습니다. 마이페이지에서 계정을 연동해 주세요.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="rounded-3xl border bg-white/80 p-6">
            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mb-4" />
            <div className="grid md:grid-cols-3 gap-4">
              {Array.from({length:6}).map((_,i)=>(
                <div key={i} className="rounded-xl border bg-white/70 p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-md bg-slate-200 animate-pulse" />
                  <div className="flex-1">
                    <div className="h-3 w-24 bg-slate-200 rounded animate-pulse mb-2" />
                    <div className="h-3 w-36 bg-slate-200 rounded animate-pulse mb-1" />
                    <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <InsightStat label="팔로워" value={fmtNum(data?.followers_count)} sub={todayTrendText(data) || trendText(data?.series?.follows, data?.series?.unfollows)} />
            <InsightStat label="도달(30일)" value={sumSeries(data?.series?.reach)} spark={data?.series?.reach} />
            <InsightStat label="노출(30일)" value={sumSeries(data?.series?.impressions)} spark={data?.series?.impressions} />
            <InsightStat label="프로필 방문(30일)" value={sumSeries(data?.series?.profile_views)} spark={data?.series?.profile_views} />
            <InsightStat label="좋아요(게시일 기준 합계)" value={sumSeries(data?.series?.approx_likes_by_post_day)} />
          </div>

          {/* 그래프 섹션: 2열 배치 (responsive, with tooltips) */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border bg-white/80 p-6">
              <div className="text-sm text-slate-500 mb-2">30일 · 팔로워 수 / 프로필 방문수</div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={mergedFollowersProfile} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradFollowers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradProfile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={6} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v)=>fmtNum(v)} labelFormatter={(l)=>fmtDate(l)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="followers" name="팔로워 수" stroke="#2563eb" fill="url(#gradFollowers)" strokeWidth={2} />
                    <Area type="monotone" dataKey="profile_views" name="프로필 방문수" stroke="#16a34a" fill="url(#gradProfile)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-3xl border bg-white/80 p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-500">30일 · 게시일 기준 좋아요 합계(approx)</div>
                <div className="text-[10px] text-slate-400">API 한계로 일별 증가분은 스냅샷 저장이 필요</div>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <RBarChart data={approxLikesByDay} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={6} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v)=>fmtNum(v)} labelFormatter={(l)=>fmtDate(l)} />
                    <Bar dataKey="value" name="좋아요" fill="#f59e0b" radius={[4,4,0,0]} />
                  </RBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 스냅샷 기반 일별 증가 */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border bg-white/80 p-6">
              <div className="text-sm text-slate-500 mb-2">스냅샷 · 팔로워 일별 증가</div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <RLineChart data={followersDelta} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={6} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v)=>fmtNum(v)} labelFormatter={(l)=>fmtDate(l)} />
                    <Line type="monotone" dataKey="value" name="증가" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </RLineChart>
                </ResponsiveContainer>
              </div>
              {!daily?.followers_delta?.length && (
                <div className="text-xs text-slate-400 mt-2">스냅샷이 아직 부족합니다. 자정 자동 스냅샷 이후에 증가분이 표시됩니다.</div>
              )}
            </div>
            <div className="rounded-3xl border bg-white/80 p-6">
              <div className="text-sm text-slate-500 mb-2">스냅샷 · 좋아요 일별 증가</div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <RBarChart data={likesDelta} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={6} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v)=>fmtNum(v)} labelFormatter={(l)=>fmtDate(l)} />
                    <Bar dataKey="value" name="증가" fill="#fb7185" radius={[4,4,0,0]} />
                  </RBarChart>
                </ResponsiveContainer>
              </div>
              {!daily?.likes_delta?.length && (
                <div className="text-xs text-slate-400 mt-2">스냅샷이 부족합니다. 최소 2일 이상 자동 기록이 있어야 증가분이 계산됩니다.</div>
              )}
            </div>
          </div>

          {/* 최근 게시글: 타일 카드 */}
          <div className="rounded-3xl border bg-white/80 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-slate-500">최근 게시글</div>
              <div className="text-xs text-slate-400">최대 9개 표시</div>
            </div>
            {mediaLoading ? (
              <div className="h-24 bg-slate-100/60 rounded-xl animate-pulse" />
            ) : mediaError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs">게시글 인사이트 로드 실패: {String(mediaError)}</div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(mediaItems || []).slice(0,9).map(m => (
                  <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="group block rounded-xl overflow-hidden border bg-white hover:shadow-sm transition">
                    <div className="relative">
                      <img src={m.preview_url} alt="" className="w-full aspect-square object-cover" />
                      <div className="absolute inset-x-2 top-2 flex gap-2">
                        <span className="px-2 py-0.5 text-[10px] rounded bg-white/90 border">{fmtDate(m.timestamp)}</span>
                        <span className="px-2 py-0.5 text-[10px] rounded bg-white/90 border">{(m.media_product_type || m.media_type) || ''}</span>
                      </div>
                      <div className="absolute inset-x-2 bottom-2 hidden group-hover:flex justify-between text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-black/60 text-white">❤️ {fmtNum(m.like_count)}</span>
                        <span className="px-2 py-0.5 rounded bg-black/60 text-white">💬 {fmtNum(m.comments_count)}</span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold truncate">
                        {('plays' in (m.insights||{})) ? (
                          <>재생 {fmtNum(m.insights?.plays)} · 도달 {fmtNum(m.insights?.reach)} · 저장 {fmtNum(m.insights?.saves)}</>
                        ) : (
                          <>노출 {fmtNum(m.insights?.impressions)} · 도달 {fmtNum(m.insights?.reach)} · 저장 {fmtNum(m.insights?.saved)}</>
                        )}
                      </div>
                      {m.caption && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{m.caption}</div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function fmtNum(v){ if(v===null||v===undefined) return '-'; const n=Number(v); if(Number.isNaN(n)) return String(v); if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function sumSeries(a){ if(!Array.isArray(a)) return '-'; const s=a.reduce((t,x)=>t+(Number(x?.value)||0),0); return fmtNum(s); }
function trendText(f,u){ if(!Array.isArray(f)||!Array.isArray(u)) return '-'; const sf=f.reduce((t,x)=>t+(Number(x?.value)||0),0); const su=u.reduce((t,x)=>t+(Number(x?.value)||0),0); const net=sf-su; const sign=net>0?'+':net<0?'':''; return `순증가 ${sign}${fmtNum(net)}`; }
function todayTrendText(d){ const v = (d?.today_followers_delta); if(v===null||v===undefined) return ''; const n=Number(v); if(Number.isNaN(n)) return ''; const sign=n>0?'+':n<0?'':''; return `오늘 순증가 ${sign}${fmtNum(n)}`; }

function InsightStat({ label, value, sub, spark }){
  return (
    <div className="rounded-3xl border bg-white/80 p-6">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value ?? '-'}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      {Array.isArray(spark) && spark.length>1 && (
        <div className="mt-3 h-10"><Sparkline data={spark.map(p=>Number(p.value)||0)} /></div>
      )}
    </div>
  );
}

function SkeletonCard(){
  return (
    <div className="rounded-3xl border bg-white/80 p-6 animate-pulse">
      <div className="h-3 w-14 bg-slate-200 rounded" />
      <div className="h-7 w-24 bg-slate-200 rounded mt-2" />
      <div className="h-10 w-full bg-slate-200 rounded mt-3" />
    </div>
  );
}

function Sparkline({ data=[] }){ const w=140,h=36; const max=Math.max(...data,1); const min=Math.min(...data,0); const span=Math.max(max-min,1); const step=data.length>1?(w/(data.length-1)):w; const pts=data.map((v,i)=>{ const x=i*step; const y=h-((v-min)/span)*h; return `${x},${y}`; }).join(' '); return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>); }
function fmtDate(s){ try{ return new Date(s).toLocaleDateString(); }catch{ return s||''; } }

// Removed custom SVG charts in favor of Recharts for better UX (tooltips, responsive, legend)
