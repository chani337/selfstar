import { useEffect } from "react";

export default function ChatGateModal({ onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-[rgba(0,0,0,0.45)] backdrop-blur-sm">
      <style>{`
        @keyframes pop { 0%{transform:scale(.9);opacity:.0} 100%{transform:scale(1);opacity:1} }
        @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .animate-pop{animation:pop .35s cubic-bezier(.2,.8,.2,1) both}
        .glow{box-shadow:0 0 0 2px rgba(59,130,246,.15), 0 20px 60px rgba(2,6,23,.35)}
        .floaty{animation:floaty 3.2s ease-in-out infinite}
      `}</style>
      <div className="w-[min(560px,92vw)] rounded-2xl border border-blue-200 bg-white p-6 animate-pop glow relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-100 blur-2xl opacity-70 floaty" />
        <h3 className="text-2xl font-extrabold mb-2 tracking-tight">채팅을 시작하기 전에</h3>
        <p className="text-slate-600">가이드와 주의사항을 확인해 주세요. 계속하면 채팅이 시작됩니다.</p>
        <ul className="mt-3 text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>서비스 정책과 커뮤니티 가이드를 준수합니다.</li>
          <li>개인정보를 공유하지 않습니다.</li>
          <li>부적절한 요청은 제한될 수 있습니다.</li>
        </ul>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onCancel}>취소</button>
          <button className="btn primary" onClick={onConfirm}>동의하고 채팅 시작</button>
        </div>
      </div>
    </div>
  );
}