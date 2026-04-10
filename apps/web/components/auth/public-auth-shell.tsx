import Image from "next/image";
import type { ReactNode } from "react";

import { ZootopiaLockup } from "@/components/branding/zootopia-brand";

type PublicAuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  imageAlt: string;
  controls: ReactNode;
  children: ReactNode;
  compact?: boolean;
  showMediaCopy?: boolean;
};

export function PublicAuthShell({
  eyebrow,
  title,
  subtitle,
  imageAlt,
  controls,
  children,
  compact = false,
  showMediaCopy = true,
}: PublicAuthShellProps) {
  const pageShellClassName = `page-shell auth-page-shell px-4 py-4 md:px-6 md:py-6 xl:px-8${compact ? " auth-page-shell--compact" : ""}`;
  const shellClassName = `auth-shell mx-auto${compact ? " auth-shell--compact" : ""}`;
  const shellBodyClassName = `auth-shell-body${compact ? " auth-shell-body--compact" : ""}`;
  const mediaPanelClassName = `auth-media-panel${compact ? " auth-media-panel--compact" : ""}`;
  const formStageClassName = `auth-form-stage${compact ? " auth-form-stage--compact" : ""}`;

  return (
    <main className={pageShellClassName}>
      <div className={shellClassName}>
        <header className="auth-shell-top">
          <ZootopiaLockup compact showTagline={false} />
          <div className="auth-utility-group">{controls}</div>
        </header>

        <div className={shellBodyClassName}>
          <section className={mediaPanelClassName}>
            <div className="auth-media-image">
              {/* Keep both media variants mounted so dark mode never flashes a light-only hero on auth pages. */}
              <Image
                src="/science-faculty-enhanced-light-5.png"
                alt={imageAlt}
                fill
                priority
                className="theme-image-light object-cover object-center"
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 100vw, 58vw"
              />
              <Image
                src="/science-faculty-enhanced-dark-4.png"
                alt={imageAlt}
                fill
                priority
                className="theme-image-dark object-cover object-center"
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 100vw, 58vw"
              />
            </div>
            <div className="auth-media-overlay" />
            {/* Admin login can hide promo copy and keep only the operational compact sign-in surface. */}
            {showMediaCopy ? (
              <div className="auth-media-copy">
                <p className="section-label">{eyebrow}</p>
                <h1 className="auth-hero-title">{title}</h1>
                <p className="auth-hero-subtitle">{subtitle}</p>
              </div>
            ) : null}
          </section>

          <section className={formStageClassName}>{children}</section>
        </div>
      </div>
    </main>
  );
}
