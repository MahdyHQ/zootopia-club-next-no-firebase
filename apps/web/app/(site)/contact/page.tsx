import { Mail, MessagesSquare, Paperclip, ShieldCheck } from "lucide-react";

import { ContactForm } from "@/components/site/contact-form";
import { getSiteContent } from "@/lib/site-content";
import { getRequestUiContext } from "@/lib/server/request-context";

export default async function ContactPage() {
  const { locale } = await getRequestUiContext();
  const content = getSiteContent(locale).contact;

  return (
    <div className="space-y-6">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.16),transparent_34%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] lg:items-end">
          <div>
            <p className="section-label">{content.eyebrow}</p>
            <h1 className="page-title mt-3 max-w-4xl text-balance">{content.title}</h1>
            <p className="page-subtitle mt-4 max-w-3xl">{content.subtitle}</p>
          </div>

          <article className="rounded-[1.8rem] border border-white/30 bg-white/70 p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
            <div className="flex items-center gap-3">
              <MessagesSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              <p className="text-sm font-bold text-foreground">{content.methodsTitle}</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.methodsBody}</p>
          </article>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-5">
          <article className="surface-card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {content.emailSupportTitle}
              </h2>
            </div>
            <p className="mt-4 text-base leading-8 text-foreground-muted">{content.emailSupportBody}</p>
            <div className="mt-6 rounded-[1.7rem] border border-emerald-500/25 bg-emerald-500/10 p-5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                <Paperclip className="h-3.5 w-3.5" />
                <span>{content.attachmentsPanelLabel}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-foreground">
                {content.attachmentsPanelBody}
              </p>
            </div>
          </article>

          <article className="surface-card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-gold" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">{content.formTitle}</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-foreground-muted">{content.formBody}</p>
            <p className="mt-4 text-sm leading-7 text-foreground-muted">{content.responseTimeNote}</p>
          </article>
        </div>

        <section className="surface-card p-6 sm:p-7">
          {/* The contact form is intentionally routed through one server endpoint so private destination email handling stays off the client.
              Future agents should keep the destination address and provider credentials in server-only code. */}
          <ContactForm locale={locale} />
        </section>
      </section>
    </div>
  );
}
