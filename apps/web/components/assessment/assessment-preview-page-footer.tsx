"use client";

import Image from "next/image";

import { ASSESSMENT_FILE_FOOTER_LAYOUT } from "@/lib/assessment-file-branding";
import { cn } from "@/lib/utils";

import { AssessmentFooterEmoji } from "@/components/assessment/assessment-footer-emoji";

type AssessmentPreviewPageFooterProps = {
  footerLine: {
    leadingEmoji: string;
    text: string;
    trailingEmoji: string;
  };
  pageNumber: number;
  sealAssetUrl: string;
  themeMode: "light" | "dark";
  className?: string;
};

export function AssessmentPreviewPageFooter({
  footerLine,
  pageNumber,
  sealAssetUrl,
  themeMode,
  className,
}: AssessmentPreviewPageFooterProps) {
  const dark = themeMode === "dark";
  const footerDirectionStyle = {
    direction: "ltr",
    unicodeBidi: "isolate",
  } as const;
  const sealImageStyle = {
    padding: `${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImagePaddingPx}px`,
    transform: `scale(${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImageScale})`,
    transformOrigin: "center",
  } as const;
  const footerTextStyle = {
    fontFamily: ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextFontFamily,
  } as const;
  const pageArcViewBox = ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcViewBox;
  const pageArcCenter = pageArcViewBox / 2;

  return (
    <footer
      dir="ltr"
      style={footerDirectionStyle}
      className={cn(
        "mt-auto flex min-h-[4rem] flex-row items-center justify-between gap-1.5 overflow-hidden rounded-[1.45rem] border px-3 py-2 sm:min-h-[4.5rem] sm:gap-3 sm:px-4 sm:py-2.5 lg:min-h-[5rem] lg:gap-4 lg:px-5 lg:py-3",
        dark
          ? "border-emerald-200/18 bg-[linear-gradient(180deg,rgba(4,13,27,0.96),rgba(5,16,30,0.9))] text-white shadow-[0_18px_42px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-[#cbe4df] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,252,251,0.95))] text-slate-900 shadow-[0_16px_34px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.98)]",
        className,
      )}
    >
      {/* 1. Seal Lane (Far Left) */}
      <div className="flex shrink-0 items-center justify-start">
        <span
          className={cn(
            "relative flex h-[3rem] w-[3rem] items-center justify-center overflow-hidden rounded-full border sm:h-[3.75rem] sm:w-[3.75rem] lg:h-[4.5rem] lg:w-[4.5rem]",
            dark
              ? "border-amber-200/22 bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.12),rgba(255,255,255,0.03)_62%,transparent_100%)]"
              : "border-[#dbcdb4] bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.96),rgba(244,236,221,0.92)_68%,rgba(227,214,188,0.84)_100%)]",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-[6%] rounded-full border",
              dark ? "border-white/8" : "border-white/72",
            )}
          />
          <Image
            src={sealAssetUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 72px, (min-width: 640px) 60px, 48px"
            className="object-contain"
            style={sealImageStyle}
          />
        </span>
      </div>

      {/* 2. Laptop Lane */}
      <div className="flex shrink-0 items-center justify-center">
        <AssessmentFooterEmoji
          emoji={footerLine.leadingEmoji}
          className={cn(
            "h-[0.9rem] w-[0.9rem] sm:h-[1rem] sm:w-[1rem] lg:h-[1.1rem] lg:w-[1.1rem]",
            dark ? "drop-shadow-[0_0_10px_rgba(125,211,252,0.18)]" : "",
          )}
        />
      </div>

      {/* 3. Dominant Arabic Text Lane */}
      <div
        className={cn(
          "flex min-w-0 grow items-center justify-center text-center",
          dark ? "text-white/82" : "text-slate-800/88",
        )}
        style={footerTextStyle}
      >
        <span
          dir="rtl"
          className="whitespace-normal text-[0.45rem] font-semibold leading-[1.2] sm:whitespace-nowrap sm:text-[0.55rem] md:text-[0.65rem] lg:text-[0.7rem]"
        >
          {footerLine.text}
        </span>
      </div>

      {/* 4. Heart Lane */}
      <div className="flex shrink-0 items-center justify-center">
        <AssessmentFooterEmoji
          emoji={footerLine.trailingEmoji}
          className={cn(
            "h-[0.9rem] w-[0.9rem] sm:h-[1rem] sm:w-[1rem] lg:h-[1.1rem] lg:w-[1.1rem]",
            dark ? "drop-shadow-[0_0_8px_rgba(248,113,113,0.22)]" : "",
          )}
        />
      </div>

      {/* 5. Page Badge Lane (Far Right) */}
      <div className="flex shrink-0 items-center justify-end">
        <span className="relative flex h-[2.5rem] w-[2.5rem] items-center justify-center sm:h-[3rem] sm:w-[3rem] lg:h-[3.5rem] lg:w-[3.5rem]">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${pageArcViewBox} ${pageArcViewBox}`}
            className="absolute inset-0 h-full w-full"
          >
            <circle
              cx={pageArcCenter}
              cy={pageArcCenter}
              r={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRadius}
              fill="none"
              stroke={dark ? "rgba(164,243,232,0.92)" : "#0f8179"}
              strokeWidth={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcStrokeWidth}
              strokeDasharray={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcDashArray}
              strokeLinecap="round"
              transform={`rotate(${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRotation} ${pageArcCenter} ${pageArcCenter})`}
            />
          </svg>
          <span
            className={cn(
              "relative text-[0.75rem] font-black tracking-[0.08em] sm:text-[0.85rem] lg:text-[1rem]",
              dark ? "text-emerald-50" : "text-[#0f8179]",
            )}
          >
            {pageNumber}
          </span>
        </span>
      </div>
    </footer>
  );
}
