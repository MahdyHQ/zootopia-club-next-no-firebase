import type { Locale } from "@zootopia/shared-types";

import { cn } from "@/lib/utils";
import {
  PROTECTED_SIGNATURE_HEART,
  PROTECTED_SIGNATURE_LAPTOP,
  getProtectedSignatureCopy,
} from "@/lib/branding/protected-signature";

type ProtectedSignatureSealProps = {
  locale: Locale;
  className?: string;
  tone?: "shell" | "light" | "dark";
  variant?: "default" | "compact";
};

export function ProtectedSignatureSeal({
  locale,
  className,
  tone = "shell",
  variant = "default",
}: ProtectedSignatureSealProps) {
  const signature = getProtectedSignatureCopy(locale);

  return (
    <section
      dir="rtl"
      className={cn(
        "protected-signature-seal",
        variant === "compact" && "protected-signature-seal--compact",
        tone === "light" && "protected-signature-seal--light",
        tone === "dark" && "protected-signature-seal--dark",
        className,
      )}
    >
      {/* This seal is the shared protected-app attribution surface.
          Keep the same copy and emoji markers aligned across the shell, preview/result pages, and export renderers; the shell uses the compact variant so attribution stays visible without reintroducing a heavy persistent footer bar. */}
      <span aria-hidden="true" className="protected-signature-seal__badge">
        {PROTECTED_SIGNATURE_LAPTOP}
      </span>
      <div className="protected-signature-seal__copy">
        <span className="protected-signature-seal__eyebrow">{signature.label}</span>
        <p className="protected-signature-seal__text">{signature.text}</p>
      </div>
      <span
        aria-hidden="true"
        className="protected-signature-seal__badge protected-signature-seal__badge--heart"
      >
        {PROTECTED_SIGNATURE_HEART}
      </span>
    </section>
  );
}
