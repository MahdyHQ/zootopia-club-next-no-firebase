"use client";

import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";
import { useEffect } from "react";

import {
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  directionForLocale,
} from "@/lib/preferences";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang={DEFAULT_LOCALE}
      dir={directionForLocale(DEFAULT_LOCALE)}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <main className="page-shell flex min-h-screen items-center justify-center px-6 py-10 sm:px-8">
          <section className="surface-card w-full max-w-2xl rounded-[2rem] p-8 sm:p-10">
            <span className="section-label">Application Error</span>
            <h1 className="page-title mt-4">Something went wrong.</h1>
            <p className="page-subtitle mt-4">
              {APP_NAME} hit an unexpected error while rendering this screen.
              Try loading it again. If the problem keeps happening, check the
              server logs and recent deployment changes.
            </p>
            <div className="status-note mt-6">
              <strong>{APP_TAGLINE}</strong>
              {error.digest ? ` Reference: ${error.digest}` : ""}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={reset} className="action-button">
                Try Again
              </button>
              <a href="/" className="secondary-button">
                Back To Home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
