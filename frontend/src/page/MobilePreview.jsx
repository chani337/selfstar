import React, { useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";

// A simple mobile device preview that renders the app inside an iframe
// with a mobile viewport width so responsive breakpoints behave as on phone.
const DEVICES = [
  { key: "iphone-se", label: "iPhone SE (375×667)", w: 375, h: 667 },
  { key: "iphone-12", label: "iPhone 12/13/14 (390×844)", w: 390, h: 844 },
  { key: "iphone-14pm", label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
  { key: "pixel-5", label: "Pixel 5 (393×851)", w: 393, h: 851 },
];

export default function MobilePreview() {
  const location = useLocation();
  const navigate = useNavigate();

  // Optional: if a ?path=/foo is present, open that inside the preview
  const targetPath = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const p = params.get("path") || "/";
    // Always append embed=1 to hide site header/footer inside iframe
    const u = new URL(p, window.location.origin);
    u.searchParams.set("embed", "1");
    return u.pathname + (u.search ? u.search : "");
  }, [location.search]);

  // Read size/scale from query optional params
  const searchParams = new URLSearchParams(location.search || "");
  const qW = parseInt(searchParams.get("w") || "", 10);
  const qH = parseInt(searchParams.get("h") || "", 10);
  const qD = searchParams.get("device") || "iphone-12";
  const preset = DEVICES.find(d => d.key === qD) || DEVICES[1];
  const [width, setWidth] = useState(Number.isFinite(qW) ? qW : preset.w);
  const [height, setHeight] = useState(Number.isFinite(qH) ? qH : preset.h);
  const [scale, setScale] = useState(() => {
    const qs = parseFloat(searchParams.get("s") || "");
    if (Number.isFinite(qs) && qs > 0) return Math.max(0.3, Math.min(2, qs));
    // Auto-fit to viewport height with small margin by default
    try {
      const avail = (typeof window !== "undefined" ? window.innerHeight : 900) - 160; // header + margins
      const needed = height + 24; // frame extra
      return Math.max(0.4, Math.min(1, avail / needed));
    } catch { return 1; }
  });

  const updateQuery = useCallback((patch) => {
    const p = new URLSearchParams(location.search || "");
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") p.delete(k);
      else p.set(k, String(v));
    });
    navigate({ pathname: location.pathname, search: `?${p.toString()}` }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const onDeviceChange = (e) => {
    const key = e.target.value;
    const d = DEVICES.find(x => x.key === key) || DEVICES[1];
    setWidth(d.w); setHeight(d.h);
    updateQuery({ device: d.key, w: d.w, h: d.h });
  };

  const onZoomChange = (e) => {
    const v = parseFloat(e.target.value);
    setScale(v);
    updateQuery({ s: v.toFixed(2) });
  };

  const fitToWindow = () => {
    try {
      const avail = (typeof window !== "undefined" ? window.innerHeight : 900) - 160;
      const needed = height + 24;
      const v = Math.max(0.3, Math.min(1.2, avail / needed));
      setScale(v);
      updateQuery({ s: v.toFixed(2) });
    } catch {}
  };

  return (
  <div className="min-h-dvh bg-slate-100/80">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold tracking-tight">모바일 전체 미리보기</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">디바이스</label>
            <select className="h-9 px-3 rounded-xl border bg-white text-sm" onChange={onDeviceChange} defaultValue={preset.key}>
              {DEVICES.map(d => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <div className="hidden sm:flex items-center gap-2 ml-3">
              <label className="text-sm text-slate-600">줌</label>
              <input type="range" min="0.4" max="1.2" step="0.02" value={scale} onChange={onZoomChange} />
              <button type="button" className="h-9 px-3 rounded-lg border bg-white text-sm" onClick={fitToWindow}>화면맞춤</button>
            </div>

            <div className="text-sm text-slate-600 ml-2">{width} × {height}</div>
            <Link
              to={new URLSearchParams(location.search || "").get("path") || "/"}
              className="h-9 px-3 inline-flex items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm text-slate-700"
            >웹으로 보기</Link>
          </div>
        </div>
      </div>

      <div className="w-full grid place-items-start">
        {/* Device frame */}
        <div
          className="relative bg-slate-900/95 shadow-[0_40px_80px_rgba(2,6,23,.35)] mx-auto"
          style={{
            width: width + 24,
            height: height + 24,
            borderRadius: 36,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            marginTop: 12,
          }}
        >
          {/* notch */}
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 top-1 h-6 w-32 bg-black/60 rounded-b-2xl"
            style={{ filter: "blur(.2px)" }}
          />
          <div aria-hidden className="absolute left-1/2 -translate-x-1/2 top-2 h-1.5 w-16 bg-black/30 rounded-full" />
          <div aria-hidden className="absolute right-6 top-2 h-2 w-2 bg-black/40 rounded-full" />

          {/* inner bezel */}
          <div className="absolute inset-0 p-3" style={{ borderRadius: 36 }}>
            <iframe
              title="Mobile preview"
              src={targetPath}
              style={{
                width: width,
                height: height,
                border: 0,
                borderRadius: 26,
                background: "#fff",
              }}
            />
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-slate-600 px-4">
        다른 경로를 보고 싶으면 주소창에 <code>?path=/원하는/경로</code>를 붙여 열 수 있습니다. 디바이스/줌은 상단에서 변경할 수 있어요.
      </p>
    </div>
  );
}
