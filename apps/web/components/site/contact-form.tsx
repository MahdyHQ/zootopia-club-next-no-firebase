"use client";

import type { Locale } from "@zootopia/shared-types";
import { CheckCircle2, LoaderCircle, SendHorizonal, TriangleAlert } from "lucide-react";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { getSiteContent } from "@/lib/site-content";

type ContactFormProps = {
  locale: Locale;
};

type ContactFormStatus =
  | { tone: "success"; title: string; body: string }
  | { tone: "danger"; title: string; body: string }
  | null;

type ContactFormValues = {
  name: string;
  email: string;
  purpose: "general" | "issue" | "suggestion";
  subject: string;
  message: string;
  website: string;
};

const INITIAL_VALUES: ContactFormValues = {
  name: "",
  email: "",
  purpose: "general",
  subject: "",
  message: "",
  website: "",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ContactForm({ locale }: ContactFormProps) {
  const content = getSiteContent(locale).contact;
  const [values, setValues] = useState<ContactFormValues>(INITIAL_VALUES);
  const [status, setStatus] = useState<ContactFormStatus>(null);
  const [isPending, setIsPending] = useState(false);

  function updateValue<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function buildValidationMessage() {
    if (!values.name.trim()) {
      return content.validation.nameRequired;
    }
    if (!values.email.trim()) {
      return content.validation.emailRequired;
    }
    if (!isValidEmail(values.email.trim())) {
      return content.validation.emailInvalid;
    }
    if (!values.subject.trim()) {
      return content.validation.subjectRequired;
    }
    if (!values.message.trim()) {
      return content.validation.messageRequired;
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = buildValidationMessage();

    if (validationMessage) {
      setStatus({
        tone: "danger",
        title: content.failureTitle,
        body: validationMessage,
      });
      return;
    }

    // This client form only collects user input and posts to the server route.
    // Keep the private admin destination email and provider credentials in server-only code.
    setIsPending(true);
    setStatus(null);

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/contact", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...values,
              locale,
            }),
          });

          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; error?: { code?: string } }
            | null;

          if (response.ok) {
            setValues(INITIAL_VALUES);
            setStatus({
              tone: "success",
              title: content.successTitle,
              body: content.successBody,
            });
            return;
          }

          if (payload?.error?.code === "CONTACT_NOT_CONFIGURED") {
            setStatus({
              tone: "danger",
              title: content.unavailableTitle,
              body: content.unavailableBody,
            });
            return;
          }

          setStatus({
            tone: "danger",
            title: content.failureTitle,
            body: content.failureBody,
          });
        } catch {
          setStatus({
            tone: "danger",
            title: content.failureTitle,
            body: content.failureBody,
          });
        } finally {
          setIsPending(false);
        }
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-5">
      {status ? (
        <div
          className={`rounded-[1.4rem] border px-4 py-4 ${
            status.tone === "success"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-50"
              : "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-50"
          }`}
        >
          <div className="flex items-start gap-3">
            {status.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div>
              <p className="font-bold">{status.title}</p>
              <p className="mt-1 text-sm leading-6 opacity-90">{status.body}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="field-label">{content.fields.name}</span>
          <input
            type="text"
            value={values.name}
            onChange={(event) => updateValue("name", event.target.value)}
            className="field-control"
            placeholder={content.placeholders.name}
            autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="field-label">{content.fields.email}</span>
          <input
            type="email"
            value={values.email}
            onChange={(event) => updateValue("email", event.target.value)}
            className="field-control"
            placeholder={content.placeholders.email}
            autoComplete="email"
          />
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <label className="block">
          <span className="field-label">{content.fields.purpose}</span>
          <select
            value={values.purpose}
            onChange={(event) =>
              updateValue("purpose", event.target.value as ContactFormValues["purpose"])
            }
            className="field-control"
          >
            <option value="general">{content.purposes.general}</option>
            <option value="issue">{content.purposes.issue}</option>
            <option value="suggestion">{content.purposes.suggestion}</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">{content.fields.subject}</span>
          <input
            type="text"
            value={values.subject}
            onChange={(event) => updateValue("subject", event.target.value)}
            className="field-control"
            placeholder={content.placeholders.subject}
          />
        </label>
      </div>

      <label className="block">
        <span className="field-label">{content.fields.message}</span>
        <textarea
          value={values.message}
          onChange={(event) => updateValue("message", event.target.value)}
          className="field-control min-h-44 resize-y"
          placeholder={content.placeholders.message}
        />
      </label>

      {/* This hidden-looking field is a Contact-page-only honeypot.
          It should remain wired through the client and server route so basic bots can be filtered without exposing new anti-spam infrastructure. */}
      <div
        aria-hidden="true"
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden opacity-0 pointer-events-none"
      >
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          value={values.website}
          onChange={(event) => updateValue("website", event.target.value)}
          autoComplete="off"
          tabIndex={-1}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-foreground-muted">{content.privacyNote}</p>
        <Button type="submit" disabled={isPending} className="min-w-[13rem]">
          {isPending ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {content.submitPending}
            </>
          ) : (
            <>
              <SendHorizonal className="h-4 w-4" />
              {content.submitIdle}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
