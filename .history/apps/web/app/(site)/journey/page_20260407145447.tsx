import { APP_ROUTES } from "@zootopia/shared-config";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  Compass,
  HandCoins,
  Landmark,
  MessageCircle,
  PenTool,
  Rocket,
  Sparkles,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type StoryMilestone = {
  id: string;
  title: string;
  body: string;
  highlight: string;
  icon: LucideIcon;
};

const FOUNDER_ROLES = [
  "صاحب الرؤية",
  "المخطط",
  "الممول",
  "المطور",
  "المصمم",
  "المنفذ",
  "صانع المنتج",
] as const;

const STORY_MILESTONES: readonly StoryMilestone[] = [
  {
    id: "story-beginning",
    title: "بداية القصة",
    body: "بدأت الرحلة عندما تحدث أدهم عصام عن الفكرة، ومع وضوح الاحتياج الحقيقي لدى الطلاب تحولت الفكرة إلى مشروع جاد له هدف واضح.",
    highlight: "حديث صادق أشعل البداية.",
    icon: MessageCircle,
  },
  {
    id: "planning",
    title: "البحث والتخطيط",
    body: "تمت دراسة مسارات التنفيذ بعناية، وموازنة الخيارات التقنية، وبناء تصور معماري قابل للنمو يخدم جودة المنتج واستقراره.",
    highlight: "تفكير هندسي قبل أي سطر كود.",
    icon: Compass,
  },
  {
    id: "funding",
    title: "التمويل وتحمّل التكلفة",
    body: "المشروع ممول ذاتياً بالكامل؛ بداية تشغيل حقيقية ثم التزام شهري مستمر لضمان استمرار الخدمة وعدم انقطاعها عن الطلاب.",
    highlight: "استثمار شخصي مباشر من أجل الاستمرارية.",
    icon: HandCoins,
  },
  {
    id: "product-design",
    title: "تصميم المنتج والتطوير",
    body: "تم تصميم الصفحات، والأدوات، وتدفقات العمل، وتجربة المستخدم، ثم تحويل هذا التصور إلى تنفيذ فعلي منظم وقابل للصيانة.",
    highlight: "تصميم عملي يخدم رحلة الطالب خطوة بخطوة.",
    icon: PenTool,
  },
  {
    id: "market-learning",
    title: "تحليل السوق والتعلم الذكي",
    body: "جرت مراجعة حلول المنافسين واستخلاص ما يفيد الطلاب فعلاً، ثم إعادة صياغة المنتج بما يناسب السياق الأكاديمي بشكل أدق.",
    highlight: "التعلم من السوق لصناعة نسخة أنسب للطلاب.",
    icon: TrendingUp,
  },
  {
    id: "ai-support",
    title: "الذكاء الاصطناعي كأداة مساعدة",
    body: "استُخدم الذكاء الاصطناعي كمساعد في بعض مراحل التطوير وبعض قدرات المنصة، لكنه لم يكن البطل؛ البطل هو الرؤية البشرية والتنفيذ البشري.",
    highlight: "الإنسان يقود، والذكاء الاصطناعي يخدم.",
    icon: BrainCircuit,
  },
  {
    id: "two-weeks",
    title: "أسبوعان من العمل المكثف",
    body: "مرحلة مركزة من التخطيط، والبناء، والاختبار، والتحسين المتواصل حتى الوصول إلى نتيجة مستقرة تليق بثقة المستخدم.",
    highlight: "اجتهاد يومي منظم حتى اكتمال الصورة.",
    icon: TimerReset,
  },
  {
    id: "launch",
    title: "الإطلاق الرسمي",
    body: "تم نشر المنصة لخدمة طلاب كلية العلوم بجامعة القاهرة، لتصبح أداة تعليمية عملية قابلة للاستخدام المباشر داخل الواقع الدراسي.",
    highlight: "انطلاقة موجهة لخدمة طلاب العلوم.",
    icon: Landmark,
  },
  {
    id: "future-vision",
    title: "الرؤية المستقبلية والدعوة للدعم",
    body: "المسار مستمر نحو تحسينات أقوى، وتجربة أعمق، وتطويرات مستقبلية أكبر. دعم المنصة هو دعم لاستمرارية مشروع يخدم الطلاب بجدية.",
    highlight: "هذه مجرد بداية لمسار أطول بإذن الله.",
    icon: Rocket,
  },
] as const;

export default function JourneyPage() {
  return (
    <div dir="rtl" className="space-y-6 font-[family-name:var(--font-arabic)]">
      <section className="surface-card relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.2),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.82),rgba(2,6,23,0.9)_62%),radial-gradient(circle_at_center,rgba(45,212,191,0.12),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:26px_26px]" />

        <div className="relative space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-400/10 px-4 py-2 text-xs font-black tracking-[0.16em] text-emerald-100">
            <Sparkles className="h-4 w-4" />
            رحلة بناء منصة Zootopia Club
          </div>

          <div className="space-y-4">
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-black leading-[1.2] tracking-tight text-white sm:text-5xl lg:max-w-4xl">
              حكاية بناء منصة تعليمية: رؤية إنسانية، تنفيذ احترافي، وأثر يخدم الطلاب
            </h1>
            <p className="max-w-3xl text-lg leading-9 text-emerald-50/90">
              هذه الصفحة توثق أصل الفكرة، ومسار التطوير، وقصة التمويل، وخريطة التنفيذ، والرؤية القادمة،
              لتكون مرجعاً رسمياً لرحلة المنصة داخل المنتج نفسه.
            </p>
            <p className="max-w-3xl rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-base leading-8 text-emerald-50">
              هذا المشروع تم بفضل الله أولاً وأخيراً، ثم بجهد بشري متواصل قاده
              <span className="font-extrabold text-white"> ابن عبدالله يوسف </span>
              من الرؤية إلى الإطلاق.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {FOUNDER_ROLES.map((role) => (
              <span
                key={role}
                className="inline-flex items-center rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3.5 py-1.5 text-sm font-bold text-emerald-100"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.1),transparent_38%)]" />
        <div className="relative rounded-[1.7rem] border border-emerald-300/20 bg-slate-950/45 p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-7">
          <p className="font-[family-name:var(--font-amiri)] text-3xl leading-[1.9] text-emerald-100 sm:text-4xl">
            بسم الله الرحمن الرحيم
          </p>
          <p className="mt-3 font-[family-name:var(--font-amiri)] text-2xl leading-[1.9] text-white sm:text-3xl">
            هذا المشروع تم بفضل الله أولاً وأخيراً
          </p>
          <p className="mt-3 font-[family-name:var(--font-amiri)] text-xl leading-[2] text-emerald-100 sm:text-2xl">
            اللهم صلِّ وسلم وزد وبارك على سيدنا محمد صلى الله عليه وسلم
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <HandCoins className="h-5 w-5 text-emerald-300" />
            <p className="section-label text-emerald-100">التمويل والاستدامة</p>
          </div>
          <p className="mt-4 text-base leading-8 text-foreground">
            القصة المالية في هذه الرحلة واضحة: تمويل ذاتي مباشر في البداية، ثم تحمل تكلفة تشغيل شهرية
            ثابتة للحفاظ على استمرارية الخدمة والجودة.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border border-emerald-300/25 bg-emerald-500/10 p-4">
              <p className="text-xs font-black tracking-[0.16em] text-emerald-200">تكلفة البداية</p>
              <p className="mt-2 text-3xl font-black text-white">70$</p>
              <p className="mt-2 text-sm leading-7 text-emerald-100/90">استثمار أولي لإطلاق البنية الفعلية.</p>
            </div>
            <div className="rounded-[1.4rem] border border-cyan-300/25 bg-cyan-500/10 p-4">
              <p className="text-xs font-black tracking-[0.16em] text-cyan-200">تكلفة شهرية</p>
              <p className="mt-2 text-3xl font-black text-white">15$</p>
              <p className="mt-2 text-sm leading-7 text-cyan-100/90">تشغيل واستضافة وخدمات داعمة للاستمرارية.</p>
            </div>
          </div>
        </article>

        <article className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-5 w-5 text-gold" />
            <p className="section-label">الهوية القيادية للمشروع</p>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">ابن عبدالله يوسف</h2>
          <p className="mt-3 text-base leading-8 text-foreground-muted">
            في هذه الرحلة كان الحضور القيادي والتنفيذي لشخص واحد واضحاً: وضع الرؤية، تخطيط المسار،
            التمويل، التصميم، البرمجة، والتنفيذ الكامل حتى الإطلاق.
          </p>
          <p className="mt-4 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm leading-7 text-emerald-100">
            الذكاء الاصطناعي ظهر كأداة مساعدة ضمن العمل، وليس كبطل القصة.
          </p>
        </article>
      </section>

      {/* This timeline structure intentionally keeps one card-per-step with stable spacing,
          so the same DOM can be exported to high-quality PDF later without layout ownership drift. */}
      <section className="surface-card relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.14),transparent_38%),radial-gradient(circle_at_bottom,rgba(2,6,23,0.9),rgba(2,6,23,0.96)_70%)]" />
        <div className="relative space-y-8">
          <div className="space-y-3">
            <p className="section-label text-emerald-100">خارطة الطريق التنفيذية</p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-white sm:text-4xl">
              من الفكرة إلى الإطلاق: مسار منظم بمحطات واضحة
            </h2>
            <p className="max-w-3xl text-base leading-8 text-emerald-50/85">
              تم تحويل محتوى الإنفوجرافيك إلى رحلة سردية منظمة، مع إبراز كل محطة كقرار تنفيذي في مسار
              بناء المنتج.
            </p>
          </div>

          <div dir="ltr" className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-300/60 via-cyan-300/45 to-emerald-200/20 lg:hidden" />
            <div className="absolute left-1/2 top-6 bottom-6 hidden w-px -translate-x-1/2 bg-gradient-to-b from-emerald-300/60 via-cyan-300/45 to-emerald-200/20 lg:block" />

            <div className="space-y-6 lg:space-y-7">
              {STORY_MILESTONES.map((milestone, index) => {
                const Icon = milestone.icon;
                const isLeft = index % 2 === 0;

                return (
                  <article
                    key={milestone.id}
                    className="relative grid gap-4 pl-12 lg:grid-cols-[minmax(0,1fr)_74px_minmax(0,1fr)] lg:items-stretch lg:pl-0"
                  >
                    <span className="absolute left-[0.58rem] top-8 h-5 w-5 rounded-full border border-emerald-200/50 bg-emerald-300/30 shadow-[0_0_22px_rgba(45,212,191,0.65)] lg:hidden" />

                    <div
                      className={`rounded-[1.7rem] border border-white/12 bg-slate-950/55 p-5 shadow-[0_14px_35px_rgba(0,0,0,0.28)] backdrop-blur-xl ${
                        isLeft ? "lg:col-start-1" : "lg:col-start-3"
                      }`}
                    >
                      <div dir="rtl" className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200/30 bg-emerald-300/10 text-emerald-200">
                            <Icon className="h-5 w-5" />
                          </span>
                          <h3 className="text-xl font-black tracking-tight text-white">{milestone.title}</h3>
                        </div>
                        <p className="text-sm leading-7 text-emerald-50/85">{milestone.body}</p>
                        <p className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-100">
                          {milestone.highlight}
                        </p>
                      </div>
                    </div>

                    <div className="hidden lg:flex lg:col-start-2 lg:items-center lg:justify-center">
                      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200/55 bg-emerald-300/25 text-emerald-100 shadow-[0_0_34px_rgba(45,212,191,0.6)]">
                        <span className="absolute inset-1.5 rounded-full border border-emerald-100/40" />
                        <Icon className="relative h-5 w-5" />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card relative overflow-hidden px-6 py-8 sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.78),rgba(2,6,23,0.92)_68%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          <div className="space-y-4">
            <p className="section-label text-emerald-100">التوقيع المؤسس</p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-white sm:text-4xl">
              ابن عبدالله يوسف
            </h2>
            <p className="text-base leading-8 text-emerald-50/90">
              رحلة هذه المنصة ليست مجرد تنفيذ تقني، بل نموذج لقيادة منتج متكاملة: رؤية، تخطيط، تمويل،
              بناء، وإدارة جودة حتى الإطلاق.
            </p>
            <p className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm leading-7 text-emerald-50">
              إن رأيت قيمة في هذه الرحلة، فدعم الاستمرارية هو دعم لخدمة تعليمية جادة لطلاب كلية العلوم.
            </p>
          </div>

          <div className="space-y-4 rounded-[1.8rem] border border-emerald-200/25 bg-emerald-400/10 p-5">
            <p className="text-xs font-black tracking-[0.17em] text-emerald-100">مسارات مباشرة</p>
            <Button asChild className="w-full justify-center rounded-full">
              <Link href={APP_ROUTES.donation}>
                <HandCoins className="h-4 w-4" />
                دعم استمرارية المنصة
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-center rounded-full border-emerald-300/30 bg-transparent text-emerald-100 hover:bg-emerald-400/10">
              <Link href={APP_ROUTES.contact}>
                <BookOpenCheck className="h-4 w-4" />
                تواصل معنا
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
