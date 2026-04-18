import { APP_ROUTES } from "@zootopia/shared-config";
import {
  ArrowDownToLine,
  ChevronRight,
  HandCoins,
  Mail,
  Rocket,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCompletedUser } from "@/lib/server/session";

const SAMPLE_SUMMARY_DOWNLOAD_SRC = "/samples/lecture-summary-sample-ar.txt";

const LECTURE_SUMMARY_FEATURE_ITEMS = [
  "استخراج نقاط المحاضرة الأساسية بشكل واضح ومباشر.",
  "تنظيم الملخص إلى أقسام: المفاهيم، القوانين، والخلاصة النهائية.",
  "اقتراح أسئلة مراجعة سريعة مرتبطة بكل جزء داخل الملخص.",
  "تهيئة المخرجات بصيغة جاهزة للمذاكرة والطباعة أو الحفظ.",
] as const;

export default async function LectureSummaryComingSoonPage() {
  await requireCompletedUser(APP_ROUTES.lectureSummary);

  return (
    <div dir="rtl" className="min-w-0 space-y-5 pb-6 sm:space-y-6 sm:pb-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/18 bg-[linear-gradient(145deg,rgba(8,47,73,0.95),rgba(15,23,42,0.96))] p-5 shadow-[0_24px_64px_rgba(2,6,23,0.34)] sm:rounded-[2.3rem] sm:p-8 lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cyan-300/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-[-3rem] h-56 w-56 rounded-full bg-sky-300/12 blur-3xl"
        />

        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.78fr)] lg:items-center">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-50">
              <Sparkles className="h-3.5 w-3.5" />
              قريباً داخل مساحة العمل
            </p>

            <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-white sm:text-4xl">
              ملخص المحاضرات الذكي
            </h1>

            <p className="max-w-2xl text-sm leading-7 text-cyan-50/90 sm:text-base sm:leading-8">
              نعمل حالياً على إطلاق أداة ذكية تحول محتوى المحاضرة إلى ملخص دقيق
              ومنظم يخدم المذاكرة السريعة. الهدف هو تقليل وقت الفرز اليدوي وتمكينك
              من الوصول المباشر لأهم النقاط العلمية في دقائق.
            </p>

            <ul className="grid gap-2.5 text-sm text-cyan-50/95 sm:grid-cols-2">
              {LECTURE_SUMMARY_FEATURE_ITEMS.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-white/16 bg-white/8 px-3.5 py-2.5 leading-6"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/10 p-3 shadow-[0_20px_52px_rgba(2,6,23,0.34)]">
            <Image
              src="/coming-soon.png"
              alt="واجهة انتظار ميزة ملخص المحاضرات الذكي"
              width={720}
              height={720}
              sizes="(max-width: 640px) 86vw, (max-width: 1024px) 62vw, 340px"
              className="h-auto w-full rounded-[1.15rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/8 dark:bg-zinc-950/36 sm:p-6">
        <div className="mb-4 flex items-center gap-2.5 text-zinc-900 dark:text-white">
          <Rocket className="h-5 w-5 text-cyan-500" />
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight">
            وصول مبكر ودعم التطوير
          </h2>
        </div>

        <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          التبرعات في هذه المرحلة تذهب مباشرة لتغطية تكلفة الأدوات والخدمات
          والموارد التقنية المطلوبة لإخراج الأداة في نسخة إنتاجية مستقرة وآمنة.
          كل مساهمة تساعدنا على تسريع الإطلاق وتحسين جودة النتائج.
        </p>

        {/* Keep funding/contact/download actions in one section so this teaser route
            remains the single trustworthy handoff surface for pre-release support. */}
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <Button asChild className="h-auto min-h-11 justify-center gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500">
            <Link href={APP_ROUTES.donation}>
              <HandCoins className="h-4.5 w-4.5" />
              ادعم التطوير عبر التبرع
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto min-h-11 justify-center gap-2 rounded-xl">
            <Link href={APP_ROUTES.contact}>
              <Mail className="h-4.5 w-4.5" />
              تواصل معنا للمساعدة والاستفسار
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto min-h-11 justify-center gap-2 rounded-xl border-cyan-300/40 bg-cyan-500/5 text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300">
            {/* The sample is a real static public file so download stays deterministic
                without introducing temporary API routes or fake placeholders. */}
            <a href={SAMPLE_SUMMARY_DOWNLOAD_SRC} download="zootopia-lecture-summary-sample-ar.txt">
              <ArrowDownToLine className="h-4.5 w-4.5" />
              تحميل عينة ملخص جاهزة
            </a>
          </Button>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/[0.06] p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
        <p className="text-sm leading-7 text-emerald-800 dark:text-emerald-200">
          إذا كنت تحتاج تفعيل مبكر، أو تريد اقتراح شكل الملخص المناسب لتخصصك،
          استخدم صفحة التواصل الرسمية وسنرد عليك بأقرب وقت.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button asChild size="sm" className="rounded-full bg-emerald-700 text-white hover:bg-emerald-600">
            <Link href={APP_ROUTES.contact}>الانتقال إلى صفحة التواصل</Link>
          </Button>

          <Link
            href={APP_ROUTES.home}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            العودة إلى الرئيسية
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
