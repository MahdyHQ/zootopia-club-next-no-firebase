"use client";

import Image from "next/image";

import { resolveAssessmentFooterEmojiIconDataUrl } from "@/lib/assessment-file-branding";
import { cn } from "@/lib/utils";

type AssessmentFooterEmojiProps = {
  emoji: string;
  className?: string;
};

export function AssessmentFooterEmoji({
  emoji,
  className,
}: AssessmentFooterEmojiProps) {
  const iconDataUrl = resolveAssessmentFooterEmojiIconDataUrl(emoji);

  if (!iconDataUrl) {
    return (
      <span aria-hidden="true" className={className}>
        {emoji}
      </span>
    );
  }

  /* These footer ornaments intentionally render through inline SVG fallbacks instead of relying
     on host emoji fonts alone. Keep this shared component for preview/result surfaces so the
     visible 💻 / ❤️ treatment matches the export lanes even on font-constrained runtimes. */
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <Image
        src={iconDataUrl}
        alt=""
        unoptimized
        width={24}
        height={24}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
