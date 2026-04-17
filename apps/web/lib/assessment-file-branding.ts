import { APP_NAME, APP_ROUTES, APP_TAGLINE } from "@zootopia/shared-config";

export type AssessmentFileThemeMode = "light" | "dark";
/* Assessment file surfaces intentionally default to light mode even when the main workspace
   theme is dark. Keep this default scoped to preview/result/export flows so future agents do
   not accidentally change the global app theme while adjusting detached file behavior. */
export const DEFAULT_ASSESSMENT_FILE_THEME_MODE: AssessmentFileThemeMode = "light";

export const ASSESSMENT_FILE_QR_TARGET = "https://linktr.ee/ebnabdallah";
export const ASSESSMENT_FILE_LOGO_ASSET_URL = "/favicon.svg";
/* Keep this exact attribution line stable across preview/result/export file surfaces.
   Future agents should update it here only, not inside individual renderers, so the footer
   never drifts into mismatched wording or legacy label fragments. */
export const ASSESSMENT_FILE_FOOTER_LINE = {
  leadingEmoji: "💻",
  text: "تمت برمجة وتطوير وتمويل هذه المنصة بكل شغف وإبداع على يد ابن عبدالله يوسف، دفعة 2022، قسم كيمياء حيوان",
  trailingEmoji: "❤️",
} as const;
export const ASSESSMENT_FILE_FOOTER_TEXT =
  `${ASSESSMENT_FILE_FOOTER_LINE.leadingEmoji} ${ASSESSMENT_FILE_FOOTER_LINE.text} ${ASSESSMENT_FILE_FOOTER_LINE.trailingEmoji}`;
export const ASSESSMENT_FILE_SIGNATURE_IMAGE_ASSET_URL = "/signature.png";
/* Footer emojis must survive browser preview, print-to-PDF, and Puppeteer capture even when the
   host runtime lacks a reliable color-emoji font. Keep these inline SVG fallbacks centralized so
   every visual footer lane can render the intended 💻 / ❤️ ornaments without font dependence. */
function buildAssessmentFooterEmojiSvgDataUrl(svgMarkup: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`;
}

const ASSESSMENT_FILE_FOOTER_EMOJI_ICON_DATA_URLS = {
  "💻": buildAssessmentFooterEmojiSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="screen-shell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2563eb" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
        <linearGradient id="screen-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="100%" stop-color="#38bdf8" />
        </linearGradient>
        <linearGradient id="base-shell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e2e8f0" />
          <stop offset="100%" stop-color="#94a3b8" />
        </linearGradient>
      </defs>
      <rect x="13" y="9" width="38" height="29" rx="5" fill="url(#screen-shell)" />
      <rect x="17" y="13" width="30" height="21" rx="3" fill="url(#screen-glow)" />
      <path d="M6 41h52l-3.9 9.4a4 4 0 0 1-3.7 2.5H13.7A4 4 0 0 1 10 50.4z" fill="url(#base-shell)" />
      <rect x="23" y="45" width="18" height="2.5" rx="1.25" fill="#64748b" />
      <path d="M26 22.5h12" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round" />
      <path d="M26 27.5h8.5" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round" opacity=".9" />
    </svg>
  `),
  "❤️": buildAssessmentFooterEmojiSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="heart-shell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fb7185" />
          <stop offset="100%" stop-color="#e11d48" />
        </linearGradient>
      </defs>
      <path d="M32 55c-1.1 0-2.2-.4-3.1-1.2C15.2 41.2 8 34.5 8 23.8 8 15 14.7 8.5 22.8 8.5c4.6 0 9 2.2 12.2 5.8 3.2-3.6 7.6-5.8 12.2-5.8C55.3 8.5 62 15 62 23.8c0 10.7-7.2 17.4-20.9 30-.9.8-2 1.2-3.1 1.2Z" fill="url(#heart-shell)" />
      <path d="M21 18.5c1.9-2.3 4.8-3.7 8-3.7 2.1 0 4 .5 5.8 1.5-3.8.6-6.8 2.8-8.8 6.2-.6.9-1.1 1.9-1.5 3.1-1.7-1.7-3-4-3.5-7.1Z" fill="#fecdd3" opacity=".72" />
    </svg>
  `),
} as const;
/* Keep the footer side anchors and page-arc geometry in one shared place so detached React file
   pages and the shared print/PDF HTML can stay visually aligned without each renderer drifting
   into its own seal size or page-badge proportions. */
export const ASSESSMENT_FILE_FOOTER_LAYOUT = {
  /* The shared footer now aims for a more print-like strip than a large ornamental card.
     Keep the side anchors compact enough that the Arabic attribution can stay on one elegant
     line on normal detached preview/export widths without the seal or page badge overpowering it. */
  sideAnchorSizePx: 80,
  /* The seal asset itself contains generous transparent margins, so we intentionally zoom it
    inside the circular frame to restore the stamp-like visual strength across preview/export. */
  sealImageScale: 3.22,
  sealImagePaddingPx: 0,
  /* Let the center lane claim a little more width so desktop/tablet footers can keep the Arabic
     line horizontal more often, while mobile still falls back to a short controlled wrap. */
  footerTextMaxWidthPx: 520,
  footerTextFontFamily:
   "'Aref Ruqaa', 'Amiri', 'Alexandria', 'Segoe UI', Tahoma, Arial, sans-serif",
  pageArcViewBox: 96,
  pageArcRadius: 36,
  pageArcStrokeWidth: 3.2,
  pageArcDashArray: "170 56",
  pageArcRotation: -128,
} as const;

export function resolveAssessmentFooterEmojiIconDataUrl(value: string) {
  return ASSESSMENT_FILE_FOOTER_EMOJI_ICON_DATA_URLS[
    value as keyof typeof ASSESSMENT_FILE_FOOTER_EMOJI_ICON_DATA_URLS
  ] ?? null;
}

const ASSESSMENT_FILE_SUPPORT_PAGE = {
  eyebrow: "رسالة أخيرة",
  title: "ادعم استمرار زوتوبيا كلوب 🤍",
  subtitle: "منصة تعليمية حقيقية تحاول أن تبقى نافعة اليوم، وأن تصبح أقوى للغد.",
  heroChips: [
    "مشروع طلابي حقيقي",
    "تكاليف تشغيل متجددة",
    "دعمك يصنع أثراً يبقى ✨",
  ],
  emotionalNote:
    "إذا كان هذا الملف قد أفادك، فتذكّر أن بقاء المنصة وتطورها يحتاجان إلى دعم صادق يساعدها على الاستمرار والنمو.",
  continuityTitle: "لماذا يهم هذا الدعم؟",
  continuityBody:
    "استمرار المنصة ليس مضموناً تلقائياً. ومن دون تغطية التكاليف التشغيلية المتجددة، قد لا نستطيع الحفاظ عليها أو تطويرها بالشكل الذي يستحقه طلاب العلوم.",
  costTitle: "ما الذي يساعده دعمك؟",
  costItems: [
    "الاستضافة",
    "المعالجة",
    "مستحقات أدوات الذكاء الاصطناعي",
    "مستحقات البرمجة",
    "الأدوات المساعدة في التطوير",
  ],
  impactTitle: "أثر مساهمتك 🚀",
  impactItems: [
    "تحافظ على فائدة المنصة للطلاب الحاليين.",
    "تمنح الأجيال القادمة منصة أنضج وأسهل في الدراسة.",
    "تفتح الطريق لمزايا أقوى وأدوات أذكى ومسارات دراسة أسهل لطلاب العلوم.",
  ],
  contactTitle: "كيف تتبرع أو تتواصل؟",
  contactBody:
    "للتبرع أو السؤال أو معرفة المزيد عن المنصة والمزايا القادمة، يمكنك التواصل مع المطور شخصياً عبر الوسائل التالية.",
  qrLabel: "QR للدعم والتواصل",
  contactPathLabel: "صفحة التواصل",
  contactPathUrl: APP_ROUTES.contact,
  directLinkLabel: "الرابط المباشر",
  directLinkUrl: ASSESSMENT_FILE_QR_TARGET,
  personalContactNote:
    "هذه الوسائل مخصصة للتبرع والاستفسارات الشخصية ومعرفة تفاصيل المنصة وما نخطط له لاحقاً.",
  closingLine:
    "كل مساهمة صادقة، مهما كانت بسيطة، قد تكون سبباً في بقاء هذه المنصة حيّة ومفيدة لطلاب اليوم وطلاب المستقبل.",
  /* The final support page signature belongs to the shared file-surface contract so detached
     preview pages and both PDF lanes can reference one asset path instead of hardcoding it per route. */
  signatureAssetUrl: ASSESSMENT_FILE_SIGNATURE_IMAGE_ASSET_URL,
} as const;

export const ASSESSMENT_FILE_BACKGROUND_URLS = {
  light: "/light-file-background.png",
  dark: "/dark-file-background.png",
} as const satisfies Record<AssessmentFileThemeMode, string>;

export const ASSESSMENT_FILE_SEAL_ASSET_URLS = {
  light: "/light-seal.png",
  dark: "/dark-seal.png",
} as const satisfies Record<AssessmentFileThemeMode, string>;

/* This faculty badge pair is part of the shared assessment file-surface identity.
   Keep light/dark mapping centralized here so detached pages plus both PDF lanes stay aligned
   without route-level hardcoding or theme drift. */
export const ASSESSMENT_FILE_FACULTY_BADGE_ASSET_URLS = {
  light: "/light-faculty-badge.png",
  dark: "/dark-faculty-badge.png",
} as const satisfies Record<AssessmentFileThemeMode, string>;

export function resolveAssessmentFileThemeMode(
  value: string | null | undefined,
  fallback: AssessmentFileThemeMode = DEFAULT_ASSESSMENT_FILE_THEME_MODE,
): AssessmentFileThemeMode {
  return value === "light" || value === "dark" ? value : fallback;
}

export function appendAssessmentThemeToHref(
  href: string,
  themeMode: AssessmentFileThemeMode,
) {
  const [pathWithSearch, hash = ""] = href.split("#", 2);
  const [pathname, search = ""] = pathWithSearch.split("?", 2);
  const searchParams = new URLSearchParams(search);
  searchParams.set("theme", themeMode);
  const resolvedSearch = searchParams.toString();

  return `${pathname}${resolvedSearch ? `?${resolvedSearch}` : ""}${hash ? `#${hash}` : ""}`;
}

export function buildAssessmentFileSurface(input: {
  platformName?: string | null;
  platformTagline?: string | null;
}) {
  // This shared file-surface descriptor keeps detached preview pages and export renderers
  // aligned on one branding/background source of truth. Future agents should extend it here
  // instead of scattering logo, QR target, file-background paths, or export-only footer copy
  // across separate preview/export implementations that are supposed to stay visually aligned.
  return {
    platformName: input.platformName?.trim() || APP_NAME,
    platformTagline: input.platformTagline?.trim() || APP_TAGLINE,
    logoAssetUrl: ASSESSMENT_FILE_LOGO_ASSET_URL,
    qrTargetUrl: ASSESSMENT_FILE_QR_TARGET,
    footerText: ASSESSMENT_FILE_FOOTER_TEXT,
    footerLine: ASSESSMENT_FILE_FOOTER_LINE,
    backgroundLightUrl: ASSESSMENT_FILE_BACKGROUND_URLS.light,
    backgroundDarkUrl: ASSESSMENT_FILE_BACKGROUND_URLS.dark,
    sealLightAssetUrl: ASSESSMENT_FILE_SEAL_ASSET_URLS.light,
    sealDarkAssetUrl: ASSESSMENT_FILE_SEAL_ASSET_URLS.dark,
    facultyBadgeLightAssetUrl: ASSESSMENT_FILE_FACULTY_BADGE_ASSET_URLS.light,
    facultyBadgeDarkAssetUrl: ASSESSMENT_FILE_FACULTY_BADGE_ASSET_URLS.dark,
    // The PDF closing/support page belongs to the same file-surface identity contract as the
    // logo, QR target, background, export footer, and repeated seal assets. Future agents should
    // extend this shared descriptor instead of hardcoding visual-file metadata inside one renderer.
    supportPage: ASSESSMENT_FILE_SUPPORT_PAGE,
  };
}
