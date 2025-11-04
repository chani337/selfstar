import React, { createContext, useContext, useMemo, useState } from 'react';
import ko from './locales/ko.json';
import en from './locales/en.json';

const RESOURCES = { ko, en };

const I18nContext = createContext({
  lang: 'ko',
  setLang: () => {},
  t: (k, vars) => k,
});

export function I18nProvider({ children, defaultLang = 'ko' }) {
  const initial = (() => {
    try {
      return localStorage.getItem('lang') || defaultLang;
    } catch {
      return defaultLang;
    }
  })();
  const [lang, setLangState] = useState(initial);

  const setLang = (l) => {
    try { localStorage.setItem('lang', l); } catch {}
    setLangState(l);
  };

  const t = (key, vars) => {
    const dict = RESOURCES[lang] || RESOURCES[defaultLang] || {};
    const parts = String(key || '').split('.');
    let cur = dict;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else { cur = key; break; }
    }
    let s = String(cur);
    if (vars && typeof vars === 'object') {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      }
    }
    return s;
  };

  const value = useMemo(() => ({ lang, setLang, t }), [lang]);
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}
