import React, { useEffect, useState } from "react";
import { API_BASE } from "@/api/client";
import { useI18n } from "../../i18n/index.js";

// --- Icons ---
function IconBubble({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8c0-3 3-5 7-5s7 2 7 5-3 5-7 5c-.7 0-1.4-.07-2-.21L3 18l1-4.5C3.4 12.2 3 10.2 3 8z" fill="currentColor" opacity="0.12" />
      <path d="M7.5 10.5c-1.2 0-2.2-.9-2.2-2s1-2 2.2-2 2.2.9 2.2 2-1 2-2.2 2z" fill="currentColor" />
    </svg>
  );
}

function IconSparkle({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l1.8 3.6L17 7l-3.2 1.4L12 12l-1.8-3.6L7 7l3.2-1.4L12 2z" fill="currentColor" opacity="0.95" />
      <path d="M5 14l1 2 2 .6-2 .6-1 2-1-2-2-.6 2-.6 1-2z" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function IconTag({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 12l10 10 10-10-9-9L2 12z" fill="currentColor" opacity="0.08" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PlanCard({ Icon, title, subtitle, price, desc, features = [], featured, buttonText, buttonPrimary, onClick }) {
  const isPro = !!featured;
  const isBiz = String(title || "").toLowerCase().includes("business") || String(title || "").includes("비즈");
  const outer = "bg-white border text-slate-900 shadow-md rounded-3xl";
  const hover = isPro ? "hover:bg-sky-600" : isBiz ? "hover:bg-indigo-600" : "hover:bg-emerald-500";
  const finalOuter = `${outer} ${hover} hover:text-white hover:shadow-2xl transition-all`;
  const finalPrice = price || "";
  const btnClass = buttonPrimary ? "bg-sky-600 text-white font-semibold shadow hover:brightness-95" : "border border-slate-200 text-slate-900 hover:bg-slate-50";

  return (
    <article className={`relative rounded-2xl overflow-hidden group ${finalOuter} h-full flex flex-col`}>
      <div className="relative p-8 flex-1 flex flex-col">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg grid place-items-center bg-slate-100 text-sky-600 group-hover:bg-white/10 group-hover:text-white">
            {Icon ? <Icon className="w-6 h-6" /> : <span className="text-xl">{title?.[0] || "?"}</span>}
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 group-hover:text-white">{title}</h3>
            <p className="text-sm text-slate-500 group-hover:text-white/90">{subtitle}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl px-4 py-4 flex items-baseline justify-between bg-white/10">
          <div className="text-3xl font-extrabold text-sky-600 group-hover:text-white">{finalPrice}</div>
          <div className="text-right max-w-[40%] text-sm text-slate-500 group-hover:text-white/90 break-words">{desc}</div>
        </div>
        <ul className="mt-5 grid gap-3">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="bg-emerald-100 text-emerald-700 mt-1 w-7 h-7 rounded-full flex items-center justify-center group-hover:bg-white/20 group-hover:text-white">
                <svg viewBox="0 0 20 20" className="w-3 h-3" fill="none"><path d="M4.5 10.5l3 3 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div className="text-sm text-slate-700 group-hover:text-white/95 break-words">{f}</div>
            </li>
          ))}
        </ul>
        <button onClick={onClick} className={`mt-6 w-full ${btnClass} py-3 rounded-full focus:outline-none focus:ring-4 focus:ring-sky-300`}>{buttonText}</button>
      </div>
    </article>
  );
}

export default function CreditPlans() {
  const { t } = useI18n();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [plan, setPlan] = useState("standard");
  const [offlineSuccess, setOfflineSuccess] = useState(false);

  const normalizePlan = (p) => {
    const v = String(p || "").toLowerCase();
    if (v === "basic" || v === "free" || v === "standard") return "standard";
    if (v === "biz" || v === "business") return "business";
    if (v === "pro") return "pro";
    return "standard";
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/credits/me`, { credentials: "include" });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setPlan(normalizePlan(j?.plan));
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const openProCheckout = () => {
    setError("");
    setSuccess(false);
    setCheckoutOpen(true);
  };

  const switchToFree = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/credits/upgrade`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "standard" })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPlan("standard");
      alert(t("credit.alert.switchFree.success"));
    } catch (e) {
      alert(t("credit.alert.switchFree.fail", { msg: e?.message || String(e || "") }));
    }
  };

  const fakePayAndUpgrade = async () => {
    setPaying(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/credits/upgrade`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "pro" })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSuccess(true);
      setPlan("pro");
      setOfflineSuccess(false);
    } catch (e) {
      // Dev/offline: treat as success
      setSuccess(true);
      setPlan("pro");
      setOfflineSuccess(true);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="pb-16">
      <style>{`.success-check { width:80px;height:80px;border-radius:9999px;display:grid;place-items:center;background:radial-gradient(120% 120% at 30% 20%, #34d399 0%, #10b981 60%, #059669 100%);color:white;box-shadow:0 12px 30px rgba(16,185,129,.35), inset 0 0 30px rgba(255,255,255,.28); }`}</style>

      <header className="text-center mb-6">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">{t("credit.header.title")}</h1>
        <p className="text-sm text-slate-600 mt-2">{t("credit.header.subtitle")}</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 items-start">
        <PlanCard Icon={IconBubble} title={t("credit.plan.free.title")} subtitle={t("credit.plan.free.subtitle")} price={t("credit.plan.free.price")} desc={t("credit.plan.free.desc")} features={[t("credit.plan.free.f1"), t("credit.plan.free.f2"), t("credit.plan.free.f3")]} buttonText={plan === "standard" ? t("credit.button.inUse") : t("credit.button.switchFree")} onClick={plan === "standard" ? undefined : switchToFree} />

        <PlanCard Icon={IconSparkle} title={t("credit.plan.pro.title")} subtitle={t("credit.plan.pro.subtitle")} price={t("credit.plan.pro.price")} desc={t("credit.plan.pro.desc")} features={[t("credit.plan.pro.f1"), t("credit.plan.pro.f2"), t("credit.plan.pro.f3")]}
          featured buttonText={plan === "pro" ? t("credit.button.inUse") : t("credit.button.upgradePro")} buttonPrimary onClick={plan === "pro" ? undefined : openProCheckout} />

        <PlanCard Icon={IconTag} title={t("credit.plan.business.title")} subtitle={t("credit.plan.business.subtitle")} price={t("credit.plan.business.price")} desc={t("credit.plan.business.desc")} features={[t("credit.plan.business.f1"), t("credit.plan.business.f2"), t("credit.plan.business.f3")]}
          buttonText={t("credit.button.contact")} />
      </section>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setCheckoutOpen(false)}>
          <div className="w-[min(560px,96vw)] rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_rgba(2,6,23,0.28)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between border-b">
              <div className="font-semibold">{t("credit.checkout.title")}</div>
              <button className="btn" onClick={() => setCheckoutOpen(false)}>{t("common.close")}</button>
            </div>
            <div className="p-5 space-y-4">
              {!success ? (
                <>
                  <div className="text-sm text-slate-600">{t("credit.checkout.desc")}</div>
                  {error && <div className="text-sm text-red-600">{error}</div>}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button className="btn light" onClick={() => setCheckoutOpen(false)}>{t("common.cancel")}</button>
                    <button className="btn primary" disabled={paying} onClick={fakePayAndUpgrade}>{paying ? t("credit.checkout.processing") : t("credit.checkout.pay")}</button>
                  </div>
                </>
              ) : (
                <div className="relative text-center py-6">
                  <div className="mx-auto success-check">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div className="mt-4 text-2xl font-extrabold text-sky-600">{t("credit.checkout.successTitle")}</div>
                  {offlineSuccess && (
                    <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 inline-block px-2 py-1 rounded">
                      {t("credit.checkout.offlineNote")}
                    </div>
                  )}
                  <button className="btn primary mt-5" onClick={() => setCheckoutOpen(false)}>{t("common.confirm")}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

