import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";
import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Alexandria,
  JetBrains_Mono,
  Amiri,
} from "next/font/google";
import type { ReactNode } from "react";

import { getRequestUiContext } from "@/lib/server/request-context";
import { VitalBackground } from "@/components/ui/vital-background";
import "./globals.css";

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

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={themeMode}
      suppressHydrationWarning
      className={`${latinFont.variable} ${arabicFont.variable} ${monoFont.variable} ${amiriFont.variable} antialiased`}
    >
      <body className="min-h-screen relative">
        <VitalBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
