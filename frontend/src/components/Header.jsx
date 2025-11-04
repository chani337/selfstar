import React from "react";
import { Link, useLocation } from "react-router-dom";
import { API_BASE } from "@/api/client";
import { useI18n } from "../../i18n/index.js";

export default function Header() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const isSignup = pathname.startsWith("/signup");

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore
    } finally {
      window.location.href = "/signup";
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold tracking-tight text-slate-900" aria-label={t('header.homeAria')}>
            <span className="text-blue-600">SelfStar</span>.AI
          </Link>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            {pathname || "/"}
          </span>
        </div>

        <nav className="flex items-center gap-3 text-sm">
          <Link to="/setup" className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white/90 px-3 font-medium text-slate-700 hover:bg-slate-50">
            {t('header.settings')}
          </Link>
          {!isSignup ? (
            <Link to="/signup" className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white/90 px-3 font-medium text-slate-700 hover:bg-slate-50">
              {t('header.auth')}
            </Link>
          ) : (
            <Link to="/" className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white/90 px-3 font-medium text-slate-700 hover:bg-slate-50">
              {t('header.home')}
            </Link>
          )}
          <button onClick={handleLogout} className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white/90 px-3 font-medium text-slate-700 hover:bg-slate-50" type="button">
            {t('header.logout')}
          </button>
        </nav>
      </div>
    </header>
  );
}

