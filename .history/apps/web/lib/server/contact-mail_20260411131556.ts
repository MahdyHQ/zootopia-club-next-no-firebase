import "server-only";
import nodemailer from "nodemailer";

type ContactPurpose = "general" | "issue" | "suggestion";
type ContactMailer = ReturnType<typeof nodemailer.createTransport>;

export type ContactMailInput = {
  locale: "en" | "ar";
  name: string;
  email: string;
  purpose: ContactPurpose;
  subject: string;
  message: string;
};

type ContactMailConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[];
};

let cachedMailer: ContactMailer | null = null;
let cachedConfigurationKey: string | null = null;

function readEnvValue(name: string) {
  return process.env[name]?.trim() || null;
}

function parseBooleanEnv(name: string) {
  const value = readEnvValue(name);
  return value ? /^(1|true|yes|on)$/i.test(value) : false;
}

function parseNumberEnv(name: string) {
  const value = readEnvValue(name);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getContactMailConfiguration(): ContactMailConfiguration | null {
  // The Contact relay depends on runtime-only SMTP env vars so the same server code
  // works in local development and production server runtime without leaking credentials.
  // Future agents must keep SMTP_PASS, SMTP_USER, EMAIL_FROM, and CONTACT_FORM_TO off the client.
  const host = readEnvValue("SMTP_HOST");
  const port = parseNumberEnv("SMTP_PORT");
  const user = readEnvValue("SMTP_USER");
  const pass = readEnvValue("SMTP_PASS");
  const from = readEnvValue("EMAIL_FROM");
  const to = (readEnvValue("CONTACT_FORM_TO") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!host || !port || !user || !pass || !from || to.length === 0) {
    return null;
  }

  return {
    host,
    port,
    secure: parseBooleanEnv("SMTP_SECURE"),
    user,
    pass,
    from,
    to,
  };
}

function getContactMailer() {
  const configuration = getContactMailConfiguration();

  if (!configuration) {
    return null;
  }

  const configurationKey = JSON.stringify(configuration);

  if (cachedMailer && cachedConfigurationKey === configurationKey) {
    return {
      configuration,
      mailer: cachedMailer,
    };
  }

  // This shared SMTP helper powers the public Contact page in both local Next.js
  // development and production runtime. Keep every credential and destination
  // lookup server-only so SMTP secrets never leak into client bundles or public UI.
  cachedMailer = nodemailer.createTransport(
    {
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      auth: {
        user: configuration.user,
        pass: configuration.pass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
    {
      from: configuration.from,
    },
  );
  cachedConfigurationKey = configurationKey;

  return {
    configuration,
    mailer: cachedMailer,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function purposeLabel(input: ContactPurpose, locale: "en" | "ar") {
  if (locale === "ar") {
    return input === "issue"
      ? "الإبلاغ عن مشكلة"
      : input === "suggestion"
        ? "طلب أو اقتراح"
        : "تواصل عام";
  }

  return input === "issue"
    ? "Issue report"
    : input === "suggestion"
      ? "Request or suggestion"
      : "General contact";
}

function buildTextBody(input: ContactMailInput) {
  const submittedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date());

  return [
    "Zootopia Club contact form submission",
    `Locale: ${input.locale}`,
    `Purpose: ${purposeLabel(input.purpose, input.locale)}`,
    `Name: ${input.name}`,
    `Reply email: ${input.email}`,
    `Submitted (UTC): ${submittedAt}`,
    `Subject: ${input.subject}`,
    "",
    "Message:",
    input.message,
  ].join("\n");
}

function buildHtmlBody(input: ContactMailInput) {
  const submittedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date());
  const messageLines = input.message
    .split(/\r?\n/)
    .map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:20px;padding:24px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#0f766e;">
          Zootopia Club contact form
        </p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;">${escapeHtml(
          input.subject,
        )}</h1>
        <div style="display:grid;gap:12px;margin-bottom:18px;">
          <div><strong>Name:</strong> ${escapeHtml(input.name)}</div>
          <div><strong>Reply email:</strong> ${escapeHtml(input.email)}</div>
          <div><strong>Purpose:</strong> ${escapeHtml(
            purposeLabel(input.purpose, input.locale),
          )}</div>
          <div><strong>Locale:</strong> ${escapeHtml(input.locale)}</div>
          <div><strong>Submitted (UTC):</strong> ${escapeHtml(submittedAt)}</div>
        </div>
        <div style="border-top:1px solid rgba(15,23,42,0.08);padding-top:18px;">
          ${messageLines}
        </div>
      </div>
    </div>
  `;
}

export function hasContactMailConfiguration() {
  return Boolean(getContactMailConfiguration());
}

export async function sendPlatformContactEmail(input: ContactMailInput) {
  const transport = getContactMailer();

  if (!transport) {
    throw new Error("CONTACT_NOT_CONFIGURED");
  }

  // This helper remains the only owner of the private admin destination email and
  // Gmail SMTP credentials for the public Contact page. Future agents must not move
  // these env reads or the CONTACT_FORM_TO value into client-visible code paths.
  const result = await transport.mailer.sendMail({
    to: transport.configuration.to,
    subject: `[Zootopia Contact] ${purposeLabel(input.purpose, "en")} | ${input.subject}`,
    replyTo: {
      name: input.name,
      address: input.email,
    },
    html: buildHtmlBody(input),
    text: buildTextBody(input),
  });

  return {
    id: result.messageId,
  };
}
