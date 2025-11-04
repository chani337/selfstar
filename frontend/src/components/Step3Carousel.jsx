import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useI18n } from "../../i18n/index.js";
import step3ChatInput from "../../img/step3-chat-input.png";
import step3Generating from "../../img/step3-generating.png";
import step3ResultDrag from "../../img/step3-result-drag.png";

export default function Step3Carousel({ images }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);

  const slides = useMemo(() => (
    images && images.length ? images : [
      { src: step3ChatInput, alt: t('carousel.alt.input'), badge: t('carousel.badge.input'), padVertical: true },
      { src: step3Generating, alt: t('carousel.alt.generating'), badge: t('carousel.badge.generating'), padVertical: true },
      { src: step3ResultDrag, alt: t('carousel.alt.result'), badge: t('carousel.badge.drag'), padVertical: false },
    ]
  ), [images, t]);

  const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIdx((i) => (i + 1) % slides.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative rounded-[1.8rem] border bg-white shadow overflow-hidden">
      <div className="relative w-full bg-neutral-50" style={{ aspectRatio: "4/5" }}>
        {slides[idx].padVertical ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white p-6">
            <img src={slides[idx].src} alt={slides[idx].alt} className="max-h-full w-auto h-auto object-contain" loading="eager" />
          </div>
        ) : (
          <img src={slides[idx].src} alt={slides[idx].alt} className="absolute inset-0 w-full h-full object-cover" loading="eager" />
        )}

        {slides[idx].badge && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 text-white text-xs px-3 py-1">
            <span className="font-medium">{slides[idx].badge}</span>
          </div>
        )}

        {slides.length > 1 && (
          <>
            <button aria-label={t('carousel.prev')} onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/85 text-neutral-800 shadow hover:bg-white">
              <ChevronLeft className="mx-auto" />
            </button>
            <button aria-label={t('carousel.next')} onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/85 text-neutral-800 shadow hover:bg-white">
              <ChevronRight className="mx-auto" />
            </button>
          </>
        )}
        {slides.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="bg-white/80 rounded-full px-2 py-1 shadow">
              {slides.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`mx-1 h-2 w-2 rounded-full ${i === idx ? 'bg-neutral-900' : 'bg-neutral-400'}`} aria-label={t('carousel.slideN', { n: i + 1 })} />
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setOpen(true)} className="absolute right-3 top-3 h-9 px-3 rounded-full bg-white/85 text-neutral-800 shadow hover:bg-white text-xs inline-flex items-center gap-1">
          <Maximize2 className="size-4" /> {t('carousel.enlarge')}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <button onClick={() => setOpen(false)} className="absolute right-6 top-6 h-10 w-10 rounded-full bg-white/90 text-neutral-800 shadow border" aria-label={t('common.close')}>
            <X className="mx-auto" />
          </button>
          <div className="h-full w-full grid place-items-center p-6">
            <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {slides[idx].padVertical ? (
                <div className="w-full h-full flex items-center justify-center bg-white p-6">
                  <img src={slides[idx].src} alt={slides[idx].alt} className="max-h-full w-auto object-contain" />
                </div>
              ) : (
                <img src={slides[idx].src} alt={slides[idx].alt} className="absolute inset-0 w-full h-full object-contain bg-black" />
              )}
              <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 text-neutral-800 shadow" aria-label={t('carousel.prev')}>
                <ChevronLeft className="mx-auto" />
              </button>
              <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 text-neutral-800 shadow" aria-label={t('carousel.next')}>
                <ChevronRight className="mx-auto" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

