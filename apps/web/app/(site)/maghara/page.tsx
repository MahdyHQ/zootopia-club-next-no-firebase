import { APP_ROUTES } from "@zootopia/shared-config";
import type { Metadata } from "next";
import { ArrowDownToLine, LogIn, UserPlus, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "المغارة | Zootopia Club",
  description:
    "المغارة: مساحة أكاديمية عامة لتحميل الملخصات والمحاضرات بصياغة عربية احترافية.",
};

const MAGHARA_DOWNLOAD_FILE_PATH =
  "/treasure-files/dr-waffa-pollution-summary-by-elmahdy-abdallah-2026.pdf";

export default function MagharaPage() {
  return (
    // This route is intentionally public under app/(site) so every visitor can access
    // the academic file showcase without authentication or protected-session coupling.
    <div dir="rtl" lang="ar" className="space-y-6">
      {/* Arabic-first ownership is enforced at the page container level (dir="rtl"), so
          card flow, spacing, and CTA ordering follow RTL layout behavior instead of text-only alignment. */}
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(242,198,106,0.2),transparent_34%)]" />
        <div className="relative space-y-4">
          <p className="section-label">المغارة</p>
          <h1 className="page-title max-w-4xl">منصة عربية راقية للملخصات الأكاديمية والمحاضرات المنظمة</h1>
          <p className="page-subtitle max-w-3xl">
            مساحة عامة بتصميم هادئ واحترافي لعرض ملفات دراسية موثوقة، مع مداخل واضحة للتنزيل والتسجيل
            والدخول إلى المنصة.
          </p>
        </div>
      </section>

      <section className="surface-card px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="section-label text-emerald-700 dark:text-emerald-200">ملف اليوم</p>
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-[1.75rem]">
              ملخص التلوث للدكتورة وفاء — إعداد المهدي عبدالله (2026)
            </h2>
            <p className="text-sm leading-7 text-foreground-muted sm:text-base">
              تنزيل مباشر لملف PDF الأكاديمي من المصدر العام للمنصة.
            </p>
          </div>
          <Button asChild className="rounded-full sm:min-w-[13rem]">
            {/* This PDF lives under /public/treasure-files, so direct href + download preserves
                static-file serving and avoids inventing a fake API route for public assets. */}
            <a href={MAGHARA_DOWNLOAD_FILE_PATH} download>
              تنزيل الملخص الآن
              <ArrowDownToLine className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Keep new-user and returning-user access paths in one clean row so the page provides
          obvious account entry points without mixing auth logic into this public content route. */}
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="surface-card p-6">
          <p className="text-base font-semibold text-foreground">لو لسه مسجلتش في المنصة، سجل من هنا</p>
          <Button asChild className="mt-4 rounded-full">
            <Link href={APP_ROUTES.login}>
              إنشاء حساب جديد
              <UserPlus className="h-4 w-4" />
            </Link>
          </Button>
        </article>

        <article className="surface-card p-6">
          <p className="text-base font-semibold text-foreground">لو أنت مسجل بالفعل، تقدر تدخل من هنا</p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link href={APP_ROUTES.login}>
              تسجيل الدخول
              <LogIn className="h-4 w-4" />
            </Link>
          </Button>
        </article>
      </section>

      <section className="surface-card px-6 py-7 sm:px-8">
        <div className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-black tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            رسالة تعريفية
          </p>
          <p className="text-base leading-8 text-foreground sm:text-lg">
            إذا كنت ترغب في إعداد ملخصات أكاديمية احترافية بهذا المستوى، أو تريد تعلّم كيفية صناعة ملفات
            دراسية راقية ومنظمة لأي مادة، فتواصل معي، وسأساعدك على تنفيذها بجودة أعلى، وباحترافية أدق،
            وبتنسيق أجمل بكثير.
          </p>
          <div className="rounded-[1.35rem] border border-amber-500/25 bg-amber-500/8 p-4 sm:p-5">
            <p className="font-[family-name:var(--font-amiri)] text-base leading-8 text-foreground sm:text-lg">
              تم إنشاء هذا بواسطة المهدي عبدالله من دفعة 2023 وبالاستعانة بأدوات الذكاء الاصطناعي 2026
            </p>
          </div>
          <p className="text-xs font-medium text-foreground-muted sm:text-sm">
            للتواصل: zootopiaclub.studio/contact
          </p>
        </div>
      </section>
    </div>
  );
}
