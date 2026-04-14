"use client";

import Image from "next/image";

import { ASSESSMENT_FILE_FOOTER_LAYOUT } from "@/lib/assessment-file-branding";
import { cn } from "@/lib/utils";

type AssessmentFileFooterProps = {
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

export function AssessmentFileFooter({
  footerLine,
  pageNumber,
  sealAssetUrl,
  themeMode,
  className,
}: AssessmentFileFooterProps) {
  const dark = themeMode === "dark";
  /* Preview/result footers now use a true three-zone composition: the seal keeps its own left
     lane, the Arabic attribution owns the center width, and the page badge gets a dedicated
     bottom-right lane. Keep these responsive anchor sizes aligned with the detached HTML footer
     media queries so preview/result pages and export HTML shrink with the same silhouette. */
  const sideAnchorSizeClassName = "h-11 w-11 sm:h-14 sm:w-14 lg:h-20 lg:w-20";
  const sideAnchorSizes = "(min-width: 1024px) 80px, (min-width: 640px) 56px, 44px";
  const sealImageStyle = {
    padding: `${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImagePaddingPx}px`,
    transform: `scale(${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImageScale})`,
    transformOrigin: "center",
  } as const;
  const footerTextStyle = {
    display: "block",
    fontFamily: ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextFontFamily,
    maxWidth: `${ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextMaxWidthPx}px`,
    overflowWrap: "normal",
    wordBreak: "normal",
  } as const;
  const pageArcViewBox = ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcViewBox;
  const pageArcCenter = pageArcViewBox / 2;
  /* Keep footer anchors physically LTR even when nested inside RTL containers.
     This protects the shared contract: seal at left, page badge at right. */
  const footerDirectionStyle = {
    direction: "ltr",
    unicodeBidi: "isolate",
  } as const;

  return (
    <footer
      /* The support page is forced to RTL for Arabic body copy, but the shared footer anchors
         must stay physically stable on every page: seal at left and page badge at right. */
      dir="ltr"
      style={footerDirectionStyle}
      className={cn(
        "mt-auto grid min-h-[3.75rem] grid-cols-[auto,minmax(0,1fr),auto] grid-rows-[1fr_auto] items-stretch gap-x-1.5 rounded-[1rem] border px-2 py-1 sm:min-h-[4.7rem] sm:gap-x-2 sm:rounded-[1.3rem] sm:px-3 sm:py-1.5 lg:min-h-[5.35rem] lg:gap-x-2.5 lg:rounded-[1.45rem] lg:px-3.5 lg:py-[0.45rem]",
        dark
          ? "border-emerald-200/15 bg-[linear-gradient(180deg,rgba(4,13,27,0.97),rgba(3,10,22,0.92))] text-white shadow-[inset_0_0_0_1px_rgba(94,234,212,0.12),0_12px_28px_rgba(1,4,14,0.18)]"
          : "border-emerald-700/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(246,251,249,0.82))] text-slate-900 shadow-[inset_0_0_0_1px_rgba(15,118,110,0.08),0_10px_22px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {/* This shared file footer keeps the left seal, centered Arabic attribution line, and
          right page-number arc inside one shared strip so detached preview pages and paged
          exports stay visually aligned instead of drifting into separate footer treatments. */}
      <span
        className={cn(
          "relative row-span-2 flex shrink-0 self-center items-center justify-center overflow-hidden rounded-full border",
          sideAnchorSizeClassName,
          dark
            ? "border-emerald-200/20 bg-white/5.5"
            : "border-emerald-700/12 bg-white/80",
        )}
      >
        <Image
          src={sealAssetUrl}
          alt=""
          fill
          sizes={sideAnchorSizes}
          className="object-contain"
          style={sealImageStyle}
        />
      </span>

      <div className="row-span-2 flex min-w-0 items-center justify-center overflow-hidden text-center" dir="rtl">
        <p
          className={cn(
            "mx-auto grid w-full max-w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-x-1 gap-y-0 text-center text-[0.49rem] font-semibold leading-[1.18] sm:gap-x-1 sm:text-[0.58rem] sm:leading-[1.14] lg:gap-x-1.5 lg:text-[0.66rem] lg:leading-[1.12]",
            dark ? "text-white/88" : "text-slate-800/90",
          )}
        >
          <span className="shrink-0 text-[0.95em] leading-none">{footerLine.leadingEmoji}</span>
          {/* Footer attribution text stays shared across preview/result/export surfaces.
              Keep the center lane structurally dominant and typographically compact so the Arabic
              sentence stays between the ornaments as one premium strip on normal widths. */}
          <span
            className="min-w-0 whitespace-normal text-center sm:whitespace-nowrap"
            style={footerTextStyle}
          >
            {footerLine.text}
          </span>
          <span className="shrink-0 text-[0.95em] leading-none">{footerLine.trailingEmoji}</span>
        </p>
      </div>

      <div className="row-span-2 flex min-h-full items-end justify-end self-stretch pb-0 sm:pb-0.5 lg:pb-[0.2rem]">
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center",
            sideAnchorSizeClassName,
          )}
        >
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
              stroke={dark ? "rgba(220,255,249,0.92)" : "#0f766e"}
              strokeWidth={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcStrokeWidth}
              strokeDasharray={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcDashArray}
              strokeLinecap="round"
              transform={`rotate(${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRotation} ${pageArcCenter} ${pageArcCenter})`}
            />
          </svg>
          <span
            className={cn(
              "relative text-[0.7rem] font-black tracking-[0.12em] sm:text-[0.82rem] lg:text-[0.95rem]",
              dark ? "text-emerald-50" : "text-emerald-700",
            )}
          >
            {pageNumber}
          </span>
        </span>
      </div>
    </footer>
  );
}
