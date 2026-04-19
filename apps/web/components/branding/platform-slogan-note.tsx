import { Crown } from "lucide-react";

import { cn } from "@/lib/utils";

const PLATFORM_SLOGAN_PREFIX = "شعارنا:";
const PLATFORM_SLOGAN_BODY = "زوتوبيا كلوب - السبق لنا، والتميّز عنواننا";

type PlatformSloganNoteTone = "adaptive" | "hero-dark";

type PlatformSloganNoteProps = {
  className?: string;
  tone?: PlatformSloganNoteTone;
};

function resolveToneClasses(tone: PlatformSloganNoteTone) {
  switch (tone) {
    case "hero-dark":
      return {
        container:
          "border-white/14 bg-white/[0.06] text-white/88 shadow-[0_20px_42px_rgba(2,6,23,0.22)]",
        icon: "border-amber-200/24 bg-amber-300/14 text-amber-100",
        accent: "text-amber-100",
      };
    default:
      return {
        container:
          "border-amber-500/18 bg-white/68 text-zinc-700 shadow-[0_14px_30px_rgba(180,83,9,0.08)] dark:border-amber-200/16 dark:bg-white/[0.05] dark:text-zinc-100/92",
        icon: "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:border-amber-200/16 dark:bg-amber-300/12 dark:text-amber-100",
        accent: "text-amber-700 dark:text-amber-200",
      };
  }
}

export function PlatformSloganNote({
  className,
  tone = "adaptive",
}: PlatformSloganNoteProps) {
  const toneClasses = resolveToneClasses(tone);

  return (
    <aside
      dir="rtl"
      role="note"
      className={cn(
        "flex w-full max-w-full items-start gap-2.5 rounded-[1.15rem] border px-3 py-2.5 text-right backdrop-blur-sm sm:px-3.5 sm:py-3 mx-auto",
        toneClasses.container,
        className,
      )}
    >
      {/* This shared note owns the compact slogan treatment for the protected Home hero
          and the protected lecture-summary hero. Keep the icon-and-text stack wrap-safe
          so the Arabic line stays elegant on small screens without creating a new card layout. */}
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          toneClasses.icon,
        )}
      >
        <Crown className="h-4 w-4" />
      </span>

      <p className="min-w-0 whitespace-normal text-[0.72rem] font-semibold leading-5 tracking-[0.01em] [overflow-wrap:anywhere] sm:text-[0.8rem] sm:leading-6">
        <span className={cn("font-black", toneClasses.accent)}>
          {PLATFORM_SLOGAN_PREFIX}
        </span>{" "}
        {PLATFORM_SLOGAN_BODY}
      </p>
    </aside>
  );
}
