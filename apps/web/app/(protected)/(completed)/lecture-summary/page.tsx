import { APP_ROUTES } from "@zootopia/shared-config";
import {
  ArrowDownToLine,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Eye,
  Gift,
  HandCoins,
  Lightbulb,
  ListChecks,
  Mail,
  Rocket,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCompletedUser } from "@/lib/server/session";

const LECTURE_SUMMARY_PREVIEW_IMAGE_SRC = "/coming-soon.png";
const LECTURE_SUMMARY_PREVIEW_IMAGE_DOWNLOAD_NAME =
  "zootopia-lecture-summary-preview.png";

const LECTURE_SUMMARY_FEATURE_ITEMS = [
  {
    icon: Lightbulb,
    text: "استخراج نقاط المحاضرة الأساسية بشكل واضح ومباشر.",
  },
  {
    icon: ListChecks,
    text: "تنظيم الملخص إلى أقسام: المفاهيم، القوانين، والخلاصة النهائية.",
  },
  {
    icon: BookOpen,
    text: "اقتراح أسئلة مراجعة سريعة مرتبطة بكل جزء داخل الملخص.",
  },
  {
    icon: BadgeCheck,
    text: "تهيئة المخرجات بصيغة جاهزة للمذاكرة والطباعة أو الحفظ.",
  },
] as const;

const LECTURE_SUMMARY_SUPPORT_POINTS = [
  "توسيع البنية الإنتاجية لتقديم أداء أسرع عند ضغط الاستخدام.",
  "تجهيز موارد المعالجة المطلوبة لضمان جودة أعلى في المخرجات.",
  "رفع جاهزية التكامل مع بقية أدوات زوتوبيا كلوب داخل المسار المحمي.",
] as const;

export default async function LectureSummaryComingSoonPage() {
  await requireCompletedUser(APP_ROUTES.lectureSummary);

  return (
    <div dir="rtl" className="min-w-0 space-y-5 pb-6 sm:space-y-6 sm:pb-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,47,73,0.96),rgba(15,23,42,0.97))] p-4 shadow-[0_24px_64px_rgba(2,6,23,0.36)] sm:rounded-[2.35rem] sm:p-6 lg:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-[-4rem] h-72 w-72 rounded-full bg-sky-300/12 blur-3xl"
        />

        <div className="relative z-10 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-50">
              <Sparkles className="h-3.5 w-3.5" />
              قريباً داخل مساحة العمل
            </p>
            <p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200/35 bg-fuchsia-300/15 px-3 py-1 text-[10px] font-black tracking-[0.14em] text-fuchsia-100">
              <Gift className="h-3.5 w-3.5" />
              معاينة هدية بصرية
            </p>
          </div>

          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-white sm:text-[2.5rem]">
            ملخص المحاضرات الذكي
          </h1>

          <p className="max-w-3xl text-sm leading-7 text-cyan-50/90 sm:text-base sm:leading-8">
            نعمل حالياً على إطلاق أداة ذكية تحول محتوى المحاضرة إلى ملخص دقيق
            ومنظم يخدم المذاكرة السريعة. الهدف هو تقليل وقت الفرز اليدوي وتمكينك
            من الوصول المباشر لأهم النقاط العلمية في دقائق.
          </p>

          {/* Keep the preview image as the visual hero so the page immediately communicates
              the upcoming feature surface before users dive into the detailed explanatory cards. */}
          <a
            href={LECTURE_SUMMARY_PREVIEW_IMAGE_SRC}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
            aria-label="فتح معاينة الصورة بالحجم الكامل"
          >
            <div className="relative overflow-hidden rounded-[1.55rem] border border-white/28 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(148,163,184,0.08))] p-2.5 shadow-[0_30px_70px_rgba(2,6,23,0.42)] sm:rounded-[1.8rem] sm:p-3.5">
              <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-slate-950/45 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-cyan-100">
                <Eye className="h-3.5 w-3.5" />
                افتح المعاينة الكاملة
              </span>
              <Image
                src={LECTURE_SUMMARY_PREVIEW_IMAGE_SRC}
                alt="واجهة انتظار ميزة ملخص المحاضرات الذكي"
                width={1408}
                height={768}
                sizes="(max-width: 640px) 95vw, (max-width: 1024px) 92vw, 1100px"
                className="h-auto w-full rounded-[1.2rem] object-cover object-center transition-transform duration-300 group-hover:scale-[1.01] sm:rounded-[1.35rem]"
              />
            </div>
          </a>

          <p className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-50/95">
            <Eye className="h-4 w-4" />
            يمكنك فتح الصورة بالحجم الكامل أو تنزيلها مباشرة من أزرار المعاينة بالأسفل.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/15 bg-white/44 p-4 backdrop-blur-2xl dark:border-white/8 dark:bg-zinc-950/36 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <article className="rounded-[1.4rem] border border-cyan-300/22 bg-white/70 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)] dark:border-cyan-300/20 dark:bg-slate-950/42 sm:p-5">
            <h2 className="mb-2 inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-black tracking-tight text-zinc-900 dark:text-white">
              <BookOpen className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              تفاصيل الميزة عند الإطلاق
            </h2>
            <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-300">
              نحافظ على كثافة المحتوى حتى تكون الصفحة مفيدة فعلياً من الآن: ماذا ستقدم
              الأداة، وكيف ستساعدك في المراجعة، وما نوع المخرجات التي تستهدفها هذه النسخة
              قبل الإطلاق النهائي.
            </p>

            <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
              {LECTURE_SUMMARY_FEATURE_ITEMS.map((item) => (
                <li
                  key={item.text}
                  className="rounded-xl border border-zinc-200/75 bg-white/78 p-3 leading-6 text-zinc-700 dark:border-white/10 dark:bg-slate-900/55 dark:text-zinc-200"
                >
                  <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-black tracking-[0.08em] text-cyan-700 dark:text-cyan-300">
                    <item.icon className="h-3.5 w-3.5" />
                    نقطة محورية
                  </span>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[1.4rem] border border-cyan-300/24 bg-[linear-gradient(145deg,rgba(236,254,255,0.86),rgba(224,242,254,0.62))] p-4 shadow-[0_16px_36px_rgba(14,116,144,0.12)] dark:border-cyan-300/20 dark:bg-[linear-gradient(145deg,rgba(8,47,73,0.6),rgba(15,23,42,0.62))] sm:p-5">
            <h3 className="mb-2 inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-black tracking-tight text-zinc-900 dark:text-white">
              <ListChecks className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              معاينة وتنزيل الصورة الرسمية
            </h3>
            <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-300">
              زر التحميل الآن يعمل مباشرة على صورة المعاينة الحقيقية الخاصة بالميزة،
              بدون أي ملف نصي بديل. يمكنك إما فتحها في تبويب مستقل أو تنزيلها مباشرة.
            </p>

            <div className="mt-4 grid gap-2.5">
              <Button asChild variant="outline" className="h-auto min-h-11 justify-center gap-2 rounded-xl border-cyan-300/45 bg-cyan-500/8 text-cyan-800 hover:bg-cyan-500/14 dark:text-cyan-200">
                <a
                  href={LECTURE_SUMMARY_PREVIEW_IMAGE_SRC}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="h-4.5 w-4.5" />
                  فتح الصورة في نافذة مستقلة
                </a>
              </Button>

              <Button asChild variant="outline" className="h-auto min-h-11 justify-center gap-2 rounded-xl border-cyan-300/45 bg-cyan-500/10 text-cyan-800 hover:bg-cyan-500/16 dark:text-cyan-200">
                <a
                  href={LECTURE_SUMMARY_PREVIEW_IMAGE_SRC}
                  download={LECTURE_SUMMARY_PREVIEW_IMAGE_DOWNLOAD_NAME}
                >
                  <ArrowDownToLine className="h-4.5 w-4.5" />
                  تحميل صورة المعاينة
                </a>
              </Button>
            </div>
          </article>
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

        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {LECTURE_SUMMARY_SUPPORT_POINTS.map((point) => (
            <li
              key={point}
              className="inline-flex items-start gap-2 rounded-xl border border-emerald-200/55 bg-emerald-50/70 px-3 py-2.5 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-950/25 dark:text-emerald-200"
            >
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

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

          <Button asChild variant="outline" className="h-auto min-h-11 justify-center gap-2 rounded-xl border-cyan-300/40 bg-cyan-500/8 text-cyan-700 hover:bg-cyan-500/12 dark:text-cyan-300">
            <a href={LECTURE_SUMMARY_PREVIEW_IMAGE_SRC} download={LECTURE_SUMMARY_PREVIEW_IMAGE_DOWNLOAD_NAME}>
              <Gift className="h-4.5 w-4.5" />
              تنزيل هدية المعاينة
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
