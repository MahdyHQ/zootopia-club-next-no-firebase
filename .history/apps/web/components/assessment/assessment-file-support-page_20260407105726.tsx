"use client";

import Image from "next/image";

import type { AssessmentPreviewFileSurface } from "@/lib/assessment-preview-model";
import { cn } from "@/lib/utils";

import { AssessmentFileFooter } from "@/components/assessment/assessment-file-footer";

type AssessmentFileSupportPageProps = {
  supportPage: AssessmentPreviewFileSurface["supportPage"];
  footerLine: AssessmentPreviewFileSurface["footerLine"];
  qrCodeDataUrl: string;
  pageNumber: number;
  sealAssetUrl: string;
  themeMode: "light" | "dark";
};

function getSurfaceTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(5,15,28,0.42),rgba(2,10,21,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_rgba(2,6,23,0.18)] backdrop-blur-xl"
    : "border-white/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.56),rgba(244,251,249,0.34))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

function getCardTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(7,18,34,0.48),rgba(4,13,26,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.22)] backdrop-blur-xl"
    : "border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.64),rgba(241,249,247,0.42))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

export function AssessmentFileSupportPage({
  supportPage,
  footerLine,
  qrCodeDataUrl,
  pageNumber,
  sealAssetUrl,
  themeMode,
}: AssessmentFileSupportPageProps) {
  const dark = themeMode === "dark";

  return (
    <section
      dir="rtl"
      lang="ar"
      className={cn(
        "flex flex-col gap-5 rounded-[1.8rem] border px-5 py-5 sm:px-6",
        getSurfaceTone(dark),
      )}
    >
      {/* This closing support page belongs to the shared detached file surface, not only to PDF
          export. Keep the Arabic-only support copy, QR routes, and centered signature together
          here so preview/result pages stay aligned with the export identity contract. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(260px,0.92fr)]">
        <div className="space-y-4">
          <header>
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-[0.68rem] font-extrabold tracking-[0.18em]",
                dark ? "bg-emerald-400/12 text-emerald-100" : "bg-emerald-50 text-emerald-700",
              )}
            >
              {supportPage.eyebrow}
            </span>
            <h2 className="mt-3 text-[1.85rem] font-black leading-[1.18] text-inherit">
              {supportPage.title}
            </h2>
            <p className={cn("mt-3 text-sm leading-7", dark ? "text-white/74" : "text-slate-600")}>
              {supportPage.subtitle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {supportPage.heroChips.map((chip) => (
                <span
                  key={chip}
                  className={cn(
                    "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                    dark
                      ? "border-white/12 bg-white/5.5 text-white/88"
                      : "border-slate-200 bg-white/80 text-slate-700",
                  )}
                >
                  {chip}
                </span>
              ))}
            </div>
          </header>

          <article className={cn("rounded-[1.4rem] border px-4 py-4", getCardTone(dark))}>
            <p className="text-sm font-semibold leading-8 text-inherit">{supportPage.emotionalNote}</p>
          </article>

          <article className={cn("rounded-[1.4rem] border px-4 py-4", getCardTone(dark))}>
            <h3 className="text-base font-bold text-inherit">{supportPage.continuityTitle}</h3>
            <p className={cn("mt-3 text-sm leading-7", dark ? "text-white/74" : "text-slate-600")}>
              {supportPage.continuityBody}
            </p>
          </article>

          <article className={cn("rounded-[1.4rem] border px-4 py-4", getCardTone(dark))}>
            <h3 className="text-base font-bold text-inherit">{supportPage.costTitle}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {supportPage.costItems.map((item) => (
                <span
                  key={item}
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                    dark ? "bg-emerald-400/12 text-emerald-100" : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {item}
                </span>
              ))}
            </div>
          </article>
        </div>

        <aside className="space-y-4">
          <article className={cn("rounded-[1.4rem] border px-4 py-4", getCardTone(dark))}>
            <h3 className="text-base font-bold text-inherit">{supportPage.impactTitle}</h3>
            <div className="mt-3 space-y-2.5">
              {supportPage.impactItems.map((item) => (
                <div
                  key={item}
                  className={cn(
                    "flex items-start gap-2 rounded-2xl border px-3 py-3",
                    dark ? "border-white/10 bg-white/5" : "border-white/75 bg-white/75",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("mt-0.5 text-xs font-black", dark ? "text-emerald-100" : "text-emerald-700")}
                  >
                    ✦
                  </span>
                  <p className="min-w-0 text-sm font-semibold leading-7 text-inherit">{item}</p>
                </div>
              ))}
            </div>
          </article>

          <article className={cn("rounded-[1.4rem] border px-4 py-4", getCardTone(dark))}>
            <h3 className="text-base font-bold text-inherit">{supportPage.contactTitle}</h3>
            <p className={cn("mt-3 text-sm leading-7", dark ? "text-white/74" : "text-slate-600")}>
              {supportPage.contactBody}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
              <div
                className={cn(
                  "grid justify-items-center gap-2 rounded-2xl border px-3 py-3 text-center",
                  dark ? "border-white/10 bg-white/5" : "border-white/75 bg-white/80",
                )}
              >
                <span className={cn("text-[0.68rem] font-extrabold tracking-[0.12em]", dark ? "text-white/58" : "text-slate-500")}>
                  {supportPage.qrLabel}
                </span>
                <Image
                  src={qrCodeDataUrl}
                  alt=""
                  unoptimized
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-[0.95rem] bg-white p-1"
                />
              </div>
              <div className="space-y-2.5">
                {/* These two cards are part of the same shared preview/result file surface.
                    Keep links clickable for support routing while intentionally suppressing raw
                    URL text so this closure section stays visually consistent with the compact
                    top-right QR branding treatment. */}
                <a
                  href={supportPage.contactPathUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${supportPage.contactPathLabel}: ${supportPage.contactPathUrl}`}
                  title={supportPage.contactPathUrl}
                  className={cn(
                    "block rounded-2xl border px-3 py-3 no-underline transition",
                    dark
                      ? "border-white/10 bg-white/5 text-white hover:bg-white/8"
                      : "border-white/75 bg-white/80 text-slate-900 hover:bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("block text-[0.68rem] font-extrabold tracking-[0.12em]", dark ? "text-white/58" : "text-slate-500")}>
                      {supportPage.contactPathLabel}
                    </span>
                    <span aria-hidden="true" className={cn("text-sm font-black", dark ? "text-emerald-100" : "text-emerald-700")}>
                      ↗
                    </span>
                  </div>
                  <span className="sr-only">{supportPage.contactPathUrl}</span>
                </a>
                <a
                  href={supportPage.directLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${supportPage.directLinkLabel}: ${supportPage.directLinkUrl}`}
                  title={supportPage.directLinkUrl}
                  className={cn(
                    "block rounded-2xl border px-3 py-3 no-underline transition",
                    dark
                      ? "border-white/10 bg-white/5 text-white hover:bg-white/8"
                      : "border-white/75 bg-white/80 text-slate-900 hover:bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("block text-[0.68rem] font-extrabold tracking-[0.12em]", dark ? "text-white/58" : "text-slate-500")}>
                      {supportPage.directLinkLabel}
                    </span>
                    <span aria-hidden="true" className={cn("text-sm font-black", dark ? "text-emerald-100" : "text-emerald-700")}>
                      ↗
                    </span>
                  </div>
                  <span className="sr-only">{supportPage.directLinkUrl}</span>
                </a>
              </div>
            </div>
            <p className={cn("mt-3 text-sm leading-7", dark ? "text-white/74" : "text-slate-600")}>
              {supportPage.personalContactNote}
            </p>
          </article>
        </aside>
      </div>

      {/* The signature image must remain final-page-only and centered in the support-page middle
          closure area. Keep this larger treatment here so it reads as the author's final sign-off
          without leaking onto question pages or overpowering the support messaging blocks above. */}
      <div className="flex justify-center py-3">
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-[1.8rem] border px-7 py-6",
            dark ? "border-white/10 bg-white/5" : "border-white/75 bg-white/82",
          )}
        >
          <Image
            src={supportPage.signatureAssetUrl}
            alt=""
            width={360}
            height={144}
            className="h-auto w-62.5 max-w-full object-contain sm:w-75 lg:w-85"
          />
        </div>
      </div>

      <p className={cn("border-t pt-4 text-sm font-semibold leading-8", dark ? "border-white/10 text-white/84" : "border-slate-200 text-slate-700")}>
        {supportPage.closingLine}
      </p>

      <AssessmentFileFooter
        footerLine={footerLine}
        pageNumber={pageNumber}
        sealAssetUrl={sealAssetUrl}
        themeMode={themeMode}
      />
    </section>
  );
}
