import type { Locale, ThemeMode } from "@zootopia/shared-types";

import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";

type AuthTopControlsProps = {
  themeMode: ThemeMode;
  locale: Locale;
  themeLabel: string;
  themeLabels: Record<ThemeMode, string>;
  localeLabel: string;
  localeLabels: Record<Locale, string>;
  className?: string;
};

export function AuthTopControls({
  themeMode,
  locale,
  themeLabel,
  themeLabels,
  localeLabel,
  localeLabels,
  className,
}: AuthTopControlsProps) {
  return (
    <div className={`flex items-center justify-end gap-2 ${className ?? ""}`.trim()}>
      {/* Auth mobile rail keeps controls compact to prevent header clutter over background media. */}
      <div className="md:hidden">
        <ThemeToggle
          value={themeMode}
          label={themeLabel}
          labels={themeLabels}
          variant="cycle-icon"
        />
      </div>
      <div className="hidden md:block">
        <ThemeToggle
          value={themeMode}
          label={themeLabel}
          labels={themeLabels}
          variant="compact"
        />
      </div>

      <div className="md:hidden">
        <LocaleToggle
          value={locale}
          label={localeLabel}
          labels={localeLabels}
          variant="cycle-icon"
        />
      </div>
      <div className="hidden md:block">
        <LocaleToggle
          value={locale}
          label={localeLabel}
          labels={localeLabels}
          variant="compact"
        />
      </div>
    </div>
  );
}