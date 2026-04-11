import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";
import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Alexandria,
  JetBrains_Mono,
  Amiri, Geist } from "next/font/google";
import type { ReactNode } from "react";

import { getRequestUiContext } from "@/lib/server/request-context";
import { VitalBackground } from "@/components/ui/vital-background";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const latinFont = Plus_Jakarta_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const arabicFont = Alexandria({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

const amiriFont = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  fallback: ["Consolas", "Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_TAGLINE,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { locale, direction, themeMode } = await getRequestUiContext();

  // Add the "dark" class when dark mode is active so Tailwind's dark: variants work.
  // The @custom-variant dark (&:is(.dark *)) in globals.css requires this class on an ancestor.
  // Without it, all dark: Tailwind classes are silently ignored, causing washed-out surfaces.
  const isDark = themeMode === "dark";

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={themeMode}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        latinFont.variable,
        arabicFont.variable,
        monoFont.variable,
        amiriFont.variable,
        "font-sans",
        geist.variable,
        isDark && "dark",
      )}
    >
      {/* Some browser extensions inject transient <body> attributes client-side; suppressing here avoids false hydration warnings. */}
      <body suppressHydrationWarning className="min-h-screen relative">
        <VitalBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
