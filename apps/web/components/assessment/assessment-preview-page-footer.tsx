"use client";

import Image from "next/image";

import { ASSESSMENT_FILE_FOOTER_LAYOUT } from "@/lib/assessment-file-branding";
import { cn } from "@/lib/utils";

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
    maxWidth: "100%",
  } as const;
  const pageArcViewBox = ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcViewBox;
  const pageArcCenter = pageArcViewBox / 2;

  return (
    <footer
      dir="ltr"
      style={footerDirectionStyle}
      className={cn(
        "mt-auto grid min-h-[4.15rem] grid-cols-[auto,minmax(0,1fr),auto] items-stretch gap-x-2.5 overflow-hidden rounded-[1.45rem] border px-3 py-2 sm:min-h-[4.85rem] sm:gap-x-3 sm:px-4 sm:py-2.5 lg:min-h-[5.55rem] lg:gap-x-4 lg:px-5 lg:py-3",
        dark
          ? "border-emerald-200/18 bg-[linear-gradient(180deg,rgba(4,13,27,0.96),rgba(5,16,30,0.9))] text-white shadow-[0_18px_42px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-[#cbe4df] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,252,251,0.95))] text-slate-900 shadow-[0_16px_34px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.98)]",
        className,
      )}
    >
      {/* This footer belongs only to `/assessment/preview/[id]`.
          It intentionally diverges from the shared result/export footer so preview can match the
          screenshot target without moving export geometry, auth, or print ownership. */}
      <span
        className={cn(
          "relative flex h-14 w-14 shrink-0 self-center items-center justify-center overflow-hidden rounded-full border sm:h-[4rem] sm:w-[4rem] lg:h-[4.8rem] lg:w-[4.8rem]",
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
          sizes="(min-width: 1024px) 77px, (min-width: 640px) 64px, 56px"
          className="object-contain"
          style={sealImageStyle}
        />
      </span>

      <div className="flex min-w-0 items-center justify-center px-0.5 sm:px-1.5 lg:px-3">
        {/* The Arabic attribution lane needs stronger width priority than the two ornament lanes.
            Keep the emoji markers compact and the text small so preview tablets/desktops stay on
            one elegant line, while phones can wrap only as a short controlled block. */}
        <div
          className={cn(
            "grid w-full max-w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-x-1.5 text-center text-[0.47rem] font-semibold leading-[1.12] sm:gap-x-2 sm:text-[0.54rem] md:text-[0.6rem] lg:gap-x-2.5 lg:text-[0.66rem]",
            dark ? "text-white/82" : "text-slate-800/88",
          )}
          style={footerTextStyle}
        >
          {/* The screenshot keeps the heart physically on the left and the laptop on the right.
              Preserve that physical layout here instead of relying on logical emoji order so the
              preview footer remains visually stable even inside RTL page content. */}
          <span
            className={cn(
              "shrink-0 text-[0.72rem] leading-none sm:text-[0.8rem] lg:text-[0.92rem]",
              dark ? "drop-shadow-[0_0_8px_rgba(248,113,113,0.2)]" : "",
            )}
          >
            {footerLine.trailingEmoji}
          </span>
          <span
            dir="rtl"
            className="min-w-0 whitespace-normal text-center md:whitespace-nowrap"
          >
            {footerLine.text}
          </span>
          <span
            className={cn(
              "shrink-0 text-[0.72rem] leading-none sm:text-[0.8rem] lg:text-[0.92rem]",
              dark ? "drop-shadow-[0_0_10px_rgba(125,211,252,0.18)]" : "",
            )}
          >
            {footerLine.leadingEmoji}
          </span>
        </div>
      </div>

      <div className="flex min-h-full items-end justify-end self-stretch pb-0.5 sm:pb-1 lg:pb-1.5">
        {/* The page badge stays in its own compact lane so preview keeps the screenshot’s
            right-edge anchor without forcing the Arabic attribution into a narrow strip. */}
        <span className="relative flex h-[3.05rem] w-[3.05rem] shrink-0 translate-y-[1px] items-center justify-center sm:h-[3.45rem] sm:w-[3.45rem] lg:h-[4.1rem] lg:w-[4.1rem]">
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
              "relative text-[0.92rem] font-black tracking-[0.08em] sm:text-[1rem] lg:text-[1.16rem]",
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
