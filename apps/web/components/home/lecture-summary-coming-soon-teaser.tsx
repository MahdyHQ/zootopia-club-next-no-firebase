"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import { ArrowUpLeft, Gift, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const LECTURE_SUMMARY_TEASER_DISMISS_STORAGE_KEY =
  "zootopia:lecture-summary:teaser:dismissed:v1";

export function LectureSummaryComingSoonTeaser() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    /* This teaser is intentionally first-visit guidance for the current browser.
       Persisting dismissal in localStorage keeps the Home surface clean for returning users
       without introducing any backend state, auth coupling, or server authority changes. */
    try {
      setIsDismissed(
        window.localStorage.getItem(
          LECTURE_SUMMARY_TEASER_DISMISS_STORAGE_KEY,
        ) === "1",
      );
    } catch {
      setIsDismissed(false);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);

    try {
      window.localStorage.setItem(
        LECTURE_SUMMARY_TEASER_DISMISS_STORAGE_KEY,
        "1",
      );
    } catch {
      // Best-effort preference only.
    }
  };

  if (!isHydrated || isDismissed) {
    return null;
  }

  return (
    <div className="relative z-10 px-5 pt-4 md:px-10 md:pt-6">
      <section
        dir="rtl"
        className="relative overflow-hidden rounded-[1.8rem] border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(12,74,110,0.94),rgba(15,23,42,0.95))] p-5 shadow-[0_24px_60px_rgba(3,7,18,0.38)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-[-2.25rem] h-48 w-48 rounded-full bg-fuchsia-300/15 blur-3xl"
        />

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="إخفاء التنبيه"
          title="إخفاء التنبيه"
          className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white/90 transition-colors hover:bg-white/18"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 max-w-3xl space-y-4 pe-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-50">
              <Sparkles className="h-3.5 w-3.5" />
              ميزة جديدة قادمة
            </p>
            <p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200/35 bg-fuchsia-400/15 px-3 py-1 text-[10px] font-black tracking-[0.14em] text-fuchsia-100">
              <Gift className="h-3.5 w-3.5" />
              هدية تجربة قريباً
            </p>
          </div>

          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-black tracking-[0.04em] text-white/95">
            انتهى عصر التلخيص اليدوي
            <span aria-hidden className="text-sm">
              🥹
            </span>
          </p>

          <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight text-white sm:text-[1.8rem]">
            صفحة ملخص المحاضرات أصبحت أكثر وضوحاً وجاهزية
          </h2>

          <p className="max-w-2xl text-sm leading-7 text-cyan-50/90 sm:text-[0.95rem]">
            جهّزنا صفحة مخصصة تعرض الآن معاينتين بصريتين حقيقيتين لواجهة الملخص:
            الصورة الرسمية الأولى وصورة ملخص مادة الإنسترو، مع تنزيل مباشر للصور
            نفسها داخل المسار المحمي.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={APP_ROUTES.lectureSummary}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200/55 bg-white px-4 py-2.5 text-sm font-black text-sky-900 shadow-[0_10px_28px_rgba(15,23,42,0.16)] transition-all hover:-translate-y-0.5 hover:bg-cyan-50 dark:border-cyan-800/60 dark:bg-cyan-950/50 dark:text-cyan-50 dark:hover:bg-cyan-900/60"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-fuchsia-300/45 bg-fuchsia-100 text-fuchsia-700">
                <Gift className="h-3.5 w-3.5" />
              </span>
              افتح صفحة الصور والنماذج
              <ArrowUpLeft className="h-4 w-4" />
            </Link>

            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white/90 transition-colors hover:bg-white/18"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
