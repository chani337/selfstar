import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/index.js";

export default function Footer({ forceMobile = false }) {
  const year = new Date().getFullYear();
  const { lang, setLang, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search || "");
  const mobileParam = params.get("mobile") === "1";
  const isPreviewRoute = location.pathname.startsWith("/preview/mobile");
  const mobileMode = forceMobile || mobileParam || isPreviewRoute;
  const inMobileInnerFrame = new URLSearchParams(location.search || "").get("mframe") === "1";

  const setMobileMode = (on) => {
    // If currently on preview route, exit to the carried path first
    if (isPreviewRoute) {
      const p = new URLSearchParams(location.search || "");
      const raw = p.get("path") || "/";
      navigate(raw);
      return;
    }
    // If inside inner mobile frame (iFrame), ask parent to toggle instead
    if (inMobileInnerFrame) {
      try {
        window.parent?.postMessage({ type: on ? 'enter-mobile-preview' : 'exit-mobile-preview', path: location.pathname + (location.search || '') }, '*');
        return;
      } catch {}
    }
    const p = new URLSearchParams(location.search || "");
    if (on) p.set("mobile", "1"); else p.delete("mobile");
    navigate({ pathname: location.pathname, search: p.toString() ? `?${p.toString()}` : "" }, { replace: true });
  };

  // When app mobile mode is on, force bottom row to a single aligned row
  const bottomRowClass = mobileMode
    ? "flex flex-row flex-wrap items-center justify-between gap-3"
    : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between";

  return (
    <footer className="border-t bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* 상단: 브랜드 + 링크 묶음 */}
  <div className={mobileMode ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10"}>
          {/* 브랜드 */}
          <div className="space-y-3">
            <div className="text-xl font-bold tracking-tight">
              <span className="text-blue-600">SelfStar</span>.AI
            </div>
            <p className="text-sm text-slate-600 leading-6">
              {t('footer.brand.desc1')}<br />
              {t('footer.brand.desc2')}<br />
              {t('footer.brand.desc3')}
            </p>

            {/* 소셜 아이콘 (Instagram / GitHub) */}
            <div className="flex items-center gap-4 pt-2">
              <a aria-label="Instagram" href="#" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </a>
              <a aria-label="GitHub" href="#" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .296c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.744.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.418-1.305.762-1.606-2.665-.303-5.466-1.333-5.466-5.932 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.119 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.625-5.475 5.921.43.371.823 1.102.823 2.222 0 1.606-.015 2.899-.015 3.293 0 .319.216.694.825.576C20.565 22.092 24 17.592 24 12.296c0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">{t('footer.columns.product.title')}</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><Link to="/dashboard" className="hover:text-slate-900">{t('footer.columns.product.dashboard')}</Link></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.product.scheduler')}</a></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.product.reports')}</a></li>
              <li><Link to="/credits" className="hover:text-slate-900">{t('footer.columns.product.credits')}</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">{t('footer.columns.resources.title')}</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.resources.guides')}</a></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.resources.tutorials')}</a></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.resources.notice')}</a></li>
            </ul>
          </div>

          <div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.company.about')}</a></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.company.jobs')}</a></li>
              <li><a href="#" className="hover:text-slate-900">{t('footer.columns.company.contact')}</a></li>
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="my-8 border-t border-slate-200" />

  <div className={bottomRowClass}>
          {/* 언어 + 보기 모드 선택 */}
          <div className="flex items-center gap-3">
            <label htmlFor="lang" className="text-sm text-slate-600">{t('i18n.language')}</label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-300 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ko">{t('i18n.korean')}</option>
              <option value="en">{t('i18n.english')}</option>
            </select>

            {/* 보기 모드: 웹 / 앱(모바일) */}
            <div className="ml-2 inline-flex rounded-xl border border-slate-300 overflow-hidden">
              <button
                type="button"
                className={`h-9 px-3 text-sm ${!mobileMode ? 'bg-white text-slate-700' : 'bg-slate-50 text-slate-500'} hover:bg-white`}
                onClick={() => setMobileMode(false)}
                title="웹 레이아웃"
              >웹</button>
              <button
                type="button"
                className={`h-9 px-3 text-sm ${mobileMode ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'} hover:bg-slate-50`}
                onClick={() => setMobileMode(true)}
                title="앱(모바일) 레이아웃"
              >앱</button>
            </div>

            {/* 전체 모바일 미리보기 제거됨 */}
          </div>

          {/* 정책 링크 */}
          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="text-slate-600 hover:text-slate-900">{t('footer.links.terms')}</a>
            <span className="text-slate-300">|</span>
            <a href="#" className="text-slate-600 hover:text-slate-900">{t('footer.links.privacy')}</a>
            <span className="text-slate-300">|</span>
            <a href="mailto:hello@selfstar.ai" className="text-slate-600 hover:text-slate-900">{t('footer.links.support')}</a>
          </div>

          {/* 카피라이트 */}
          <div className="text-sm text-slate-500">
            © {year} SelfStar.AI. {t('footer.copyright')}
          </div>
        </div>
      </div>
    </footer>
  );
}
