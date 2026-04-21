"use client";

import {
  CONTACT_ATTACHMENT_ACCEPT_ATTRIBUTE,
  CONTACT_ATTACHMENT_MAX_TOTAL_BYTES,
  validateContactAttachmentBatch,
} from "@zootopia/shared-utils";
import type { Locale } from "@zootopia/shared-types";
import {
  CheckCircle2,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  SendHorizonal,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState } from "react";

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

function formatAttachmentSize(sizeBytes: number) {
  const megabytes = sizeBytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }

  const kilobytes = sizeBytes / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

function isPdfAttachment(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function ContactForm({ locale }: ContactFormProps) {
  const content = getSiteContent(locale).contact;
  const [values, setValues] = useState<ContactFormValues>(INITIAL_VALUES);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [status, setStatus] = useState<ContactFormStatus>(null);
  const [isPending, setIsPending] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  function updateValue<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resolveAttachmentValidationMessage(files: readonly File[]) {
    const result = validateContactAttachmentBatch(
      files.map((file) => ({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
    );

    if (result.ok) {
      return null;
    }

    if (result.code === "ATTACHMENT_TOTAL_TOO_LARGE") {
      return content.validation.attachmentsTooLarge;
    }

    if (result.code === "ATTACHMENT_TYPE_UNSUPPORTED") {
      return content.validation.attachmentsInvalidType;
    }

    return content.validation.attachmentsUnreadable;
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

    return resolveAttachmentValidationMessage(attachments);
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextAttachments = Array.from(event.target.files || []);
    const validationMessage = resolveAttachmentValidationMessage(nextAttachments);

    if (validationMessage) {
      event.target.value = "";
      setAttachmentError(validationMessage);
      setStatus({
        tone: "danger",
        title: content.failureTitle,
        body: validationMessage,
      });
      return;
    }

    setAttachments(nextAttachments);
    setAttachmentError(null);
    setStatus(null);
  }

  function resetAttachmentInput() {
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = buildValidationMessage();

    if (validationMessage) {
      setAttachmentError(resolveAttachmentValidationMessage(attachments));
      setStatus({
        tone: "danger",
        title: content.failureTitle,
        body: validationMessage,
      });
      return;
    }

    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("name", values.name);
    formData.set("email", values.email);
    formData.set("purpose", values.purpose);
    formData.set("subject", values.subject);
    formData.set("message", values.message);
    formData.set("website", values.website);

    for (const file of attachments) {
      formData.append("attachments", file);
    }

    // The browser only packages the public form fields and optional attachments. The
    // route handler still owns the real attachment allowlist, total-size limit, and
    // relay-only delivery contract so public uploads never become durable platform data.
    setIsPending(true);
    setAttachmentError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { code?: string } }
        | null;

      if (response.ok) {
        setValues(INITIAL_VALUES);
        setAttachments([]);
        resetAttachmentInput();
        setStatus({
          tone: "success",
          title: content.successTitle,
          body: content.successBody,
        });
        return;
      }

      const errorCode = payload?.error?.code;
      if (errorCode === "CONTACT_NOT_CONFIGURED") {
        setStatus({
          tone: "danger",
          title: content.unavailableTitle,
          body: content.unavailableBody,
        });
        return;
      }

      if (errorCode === "CONTACT_RATE_LIMITED") {
        setStatus({
          tone: "danger",
          title: content.rateLimitedTitle,
          body: content.rateLimitedBody,
        });
        return;
      }

      if (
        errorCode === "CONTACT_ATTACHMENTS_TOTAL_TOO_LARGE" ||
        errorCode === "CONTACT_REQUEST_TOO_LARGE"
      ) {
        setAttachmentError(content.validation.attachmentsTooLarge);
        setStatus({
          tone: "danger",
          title: content.failureTitle,
          body: content.validation.attachmentsTooLarge,
        });
        return;
      }

      if (errorCode === "CONTACT_ATTACHMENT_TYPE_INVALID") {
        setAttachmentError(content.validation.attachmentsInvalidType);
        setStatus({
          tone: "danger",
          title: content.failureTitle,
          body: content.validation.attachmentsInvalidType,
        });
        return;
      }

      if (
        errorCode === "CONTACT_ATTACHMENTS_INVALID" ||
        errorCode === "CONTACT_ATTACHMENT_BODY_INVALID" ||
        errorCode === "CONTACT_FORM_INVALID"
      ) {
        setAttachmentError(content.validation.attachmentsUnreadable);
        setStatus({
          tone: "danger",
          title: content.failureTitle,
          body: content.validation.attachmentsUnreadable,
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
  }

  const totalAttachmentBytes = attachments.reduce((total, file) => total + file.size, 0);

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

      <div className="block">
        <span className="field-label">{content.fields.attachments}</span>
        <input
          ref={attachmentInputRef}
          id="contact-attachments"
          type="file"
          multiple
          accept={CONTACT_ATTACHMENT_ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={handleAttachmentChange}
        />
        <label
          htmlFor="contact-attachments"
          className="block cursor-pointer rounded-[1.45rem] border border-dashed border-emerald-500/30 bg-emerald-500/5 p-4 transition-colors hover:border-emerald-500/45 hover:bg-emerald-500/8"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Paperclip className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <span>{content.attachmentHint}</span>
              </div>
              <p className="text-sm leading-6 text-foreground-muted">
                {content.attachmentEmailOnlyNote}
              </p>
            </div>
            <span className="inline-flex items-center justify-center rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-semibold text-foreground shadow-sm dark:bg-zinc-950/60">
              {content.attachmentChooseAction}
            </span>
          </div>
        </label>

        <div className="mt-3 rounded-[1.3rem] border border-border/80 bg-white/55 p-4 dark:bg-zinc-950/35">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{content.attachmentSelectedTitle}</p>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground-muted">
              {content.attachmentTotalLabel}: {formatAttachmentSize(totalAttachmentBytes)} /{" "}
              {formatAttachmentSize(CONTACT_ATTACHMENT_MAX_TOTAL_BYTES)}
            </p>
          </div>

          {attachments.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {attachments.map((file) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-start gap-3 rounded-[1rem] border border-border/70 bg-background/80 px-3 py-3 dark:bg-zinc-950/55"
                >
                  {isPdfAttachment(file) ? (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  ) : (
                    <FileImage className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  )}
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-foreground">{file.name}</p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {formatAttachmentSize(file.size)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-foreground-muted">{content.attachmentEmpty}</p>
          )}
        </div>

        {attachmentError ? (
          <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">
            {attachmentError}
          </p>
        ) : null}
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
        className="pointer-events-none absolute left-[-10000px] top-auto h-px w-px overflow-hidden opacity-0"
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
