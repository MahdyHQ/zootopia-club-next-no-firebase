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
};

export function PublicAuthShell({
  eyebrow,
  title,
  subtitle,
  imageAlt,
  controls,
  children,
}: PublicAuthShellProps) {
  return (
    <main className="page-shell auth-page-shell px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <div className="auth-shell mx-auto">
        <header className="auth-shell-top">
          <ZootopiaLockup compact showTagline={false} />
          <div className="auth-utility-group">{controls}</div>
        </header>

        <div className="auth-shell-body">
          <section className="auth-media-panel">
            <div className="auth-media-image">
              <Image
                src="/science-faculty-enhanced-light-5.png"
                alt={imageAlt}
                fill
                priority
                className="object-cover object-center"
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 100vw, 58vw"
              />
            </div>
            <div className="auth-media-overlay" />
            <div className="auth-media-copy">
              <p className="section-label">{eyebrow}</p>
              <h1 className="auth-hero-title">{title}</h1>
              <p className="auth-hero-subtitle">{subtitle}</p>
            </div>
          </section>

          <section className="auth-form-stage">{children}</section>
        </div>
      </div>
    </main>
  );
}
