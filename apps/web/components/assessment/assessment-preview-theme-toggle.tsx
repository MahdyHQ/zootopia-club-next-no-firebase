"use client";

import type { AssessmentPreviewThemeMode } from "@/lib/assessment-preview-model";
import type { AppMessages } from "@/lib/messages";

interface AssessmentPreviewThemeToggleProps {
  value: AssessmentPreviewThemeMode;
  messages: AppMessages;
  onChange: (value: AssessmentPreviewThemeMode) => void;
}

export function AssessmentPreviewThemeToggle({
  value,
  messages,
  onChange,
}: AssessmentPreviewThemeToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-black/[0.04] p-1 dark:bg-white/[0.05]">
      {([
        ["light", messages.themeLight],
        ["dark", messages.themeDark],
      ] as const).map(([theme, label]) => {
        const selected = value === theme;

        return (
          <button
            key={theme}
            type="button"
            onClick={() => {
              onChange(theme);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              selected
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-foreground-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
