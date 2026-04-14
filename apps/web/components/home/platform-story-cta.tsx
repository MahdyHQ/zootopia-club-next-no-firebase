"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import { ArrowDownToLine, CircleHelp, Sparkles, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const ROADMAP_IMAGE_SRC = "/zootopiaclub-inphographic-plan.png";

export function PlatformStoryCta() {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    if (!isViewerOpen) {
      return undefined;
    }

    // Keep page scroll ownership inside the modal while the roadmap viewer is open.
    const previousBodyOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsViewerOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isViewerOpen]);

  return (
    <>
      <section
        dir="rtl"
        className="home-story-cta-surface relative overflow-hidden rounded-[1.95rem] border border-white/20 dark:border-white/8 px-5 py-6 sm:px-7 sm:py-7"
      >
        <div className="home-story-cta-surface__aurora" aria-hidden />

        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2.5">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              قصة بناء المنصة
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-black tracking-tight text-white sm:text-2xl">
              اكتشف الرحلة الكاملة من الفكرة إلى الإطلاق
            </h2>
          </div>

          <button
            type="button"
            className="home-story-cta-button"
            aria-haspopup="dialog"
            aria-expanded={isViewerOpen}
            aria-controls="home-story-roadmap-viewer"
            onClick={() => setIsViewerOpen(true)}
          >
            <span className="home-story-cta-button__orbit" aria-hidden />
            <span className="home-story-cta-button__content">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-300/20 text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.28)]">
                <CircleHelp className="h-4 w-4" />
              </span>
              <span className="home-story-cta-button__label">عندك فضول تعرف إزاي اتعملت المنصة؟</span>
              <Sparkles className="h-4 w-4 text-cyan-100" />
            </span>
          </button>
        </div>
      </section>

      {isViewerOpen ? (
        <div className="home-story-modal fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-6" onClick={() => setIsViewerOpen(false)}>
          <div className="home-story-modal__backdrop absolute inset-0" aria-hidden />

          {/* Keep roadmap viewing, download, and Journey navigation in one modal so Home owns discovery while /journey remains the full narrative destination. */}
          <div
            id="home-story-roadmap-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-story-roadmap-title"
            className="home-story-modal__panel relative z-10 flex w-full max-w-6xl max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden rounded-[1.7rem] border border-border-strong bg-background-elevated/95 p-3 shadow-[0_24px_64px_rgba(60,25,8,0.2)] backdrop-blur-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5 dark:border-white/12 dark:bg-slate-950/90 dark:shadow-[0_28px_80px_rgba(2,6,23,0.72)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="home-story-modal__close-button"
              onClick={() => setIsViewerOpen(false)}
              aria-label="إغلاق العرض"
            >
              <X className="h-4 w-4" />
            </button>

            {/* This scroll container keeps the roadmap preview and actions accessible on short/mobile viewports
                while preserving a single centered modal panel across desktop/tablet/mobile sizes. */}
            <div className="home-story-modal__content min-h-0 space-y-4 overflow-y-auto pt-11">
              <div dir="rtl" className="space-y-2 pe-12">
                <p className="text-xs font-black tracking-[0.16em] text-cyan-700 dark:text-cyan-200">مخطط رحلة المنصة</p>
                <h3 id="home-story-roadmap-title" className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight text-foreground sm:text-3xl dark:text-white">
                  خارطة الطريق الأصلية
                </h3>
              </div>

              <div className="home-story-modal__image-shell max-h-[min(66dvh,860px)] overflow-auto rounded-[1.5rem] border border-border-strong bg-background-strong/80 p-2.5 dark:border-white/12 dark:bg-slate-900/55 sm:p-3.5">
                <Image
                  src={ROADMAP_IMAGE_SRC}
                  alt="الإنفوجرافيك الأصلي لمسار بناء منصة زوتوبيا كلوب"
                  width={1536}
                  height={2048}
                  sizes="(max-width: 640px) 95vw, (max-width: 1024px) 88vw, 980px"
                  className="mx-auto block h-auto w-full max-w-[980px] rounded-[1.2rem] border border-border-strong object-contain dark:border-white/15"
                  priority
                />
              </div>

              <div dir="rtl" className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <Button asChild className="home-story-modal__action home-story-modal__action--download w-full sm:w-auto">
                  <a href={ROADMAP_IMAGE_SRC} download="zootopia-club-roadmap.png">
                    <ArrowDownToLine className="h-4 w-4" />
                    تحميل الصورة
                  </a>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="home-story-modal__action home-story-modal__action--journey w-full sm:w-auto"
                >
                  <Link href={APP_ROUTES.journey} onClick={() => setIsViewerOpen(false)}>
                    <Sparkles className="h-4 w-4" />
                    استكشف رحلة المنصة
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
