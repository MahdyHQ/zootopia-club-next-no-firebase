import { cn } from "@/lib/utils";

const ASSESSMENT_PLATFORM_INFO_NOTE_TEXT =
  "هذه المنصة مميزة وليس لها منافس على الإنترنت، وهى عصارة خبرة المطور, وقد تحدث أخطاء خارجة عن إرادة المطور، ونعمل بجد لإصلاحها";

type AssessmentPlatformInfoNoteTone =
  | "adaptive"
  | "detached-light"
  | "detached-dark";

type AssessmentPlatformInfoNoteProps = {
  className?: string;
  tone?: AssessmentPlatformInfoNoteTone;
};

function resolveToneClasses(tone: AssessmentPlatformInfoNoteTone) {
  switch (tone) {
    case "detached-dark":
      return "border-white/12 bg-white/[0.05] text-white/78";
    case "detached-light":
      return "border-slate-200/90 bg-white/86 text-slate-600";
    default:
      return "border-zinc-900/8 bg-zinc-900/[0.03] text-zinc-700 dark:border-white/12 dark:bg-white/[0.05] dark:text-zinc-200/88";
  }
}

export function AssessmentPlatformInfoNote({
  className,
  tone = "adaptive",
}: AssessmentPlatformInfoNoteProps) {
  /* This notice is shared between the Assessment hero and detached preview header.
     Keep the type scale compact and wrapping permissive so Arabic copy stays readable
     without pushing surrounding header controls out of their established layout pockets. */
  return (
    <aside
      dir="rtl"
      role="note"
      className={cn(
        "w-full max-w-full rounded-[1rem] border px-3 py-2 text-[0.67rem] leading-5 sm:px-3.5 sm:text-[0.74rem]",
        resolveToneClasses(tone),
        className,
      )}
    >
      <p className="flex items-start gap-1.5 text-right">
        <span aria-hidden="true" className="pt-[1px] text-[0.86em] leading-none">
          😊
        </span>
        <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
          {ASSESSMENT_PLATFORM_INFO_NOTE_TEXT}
        </span>
      </p>
    </aside>
  );
}
