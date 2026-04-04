import { apiError, apiSuccess } from "@/lib/server/api";
import {
  hasContactMailConfiguration,
  sendPlatformContactEmail,
} from "@/lib/server/contact-mail";

export const runtime = "nodejs";

type ContactRouteBody = {
  locale?: unknown;
  name?: unknown;
  email?: unknown;
  purpose?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 320;
const SUBJECT_MAX_LENGTH = 160;
const MESSAGE_MAX_LENGTH = 4_000;

function normalizeSingleLine(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeMessage(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  let body: ContactRouteBody;

  try {
    body = (await request.json()) as ContactRouteBody;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const locale = body.locale === "ar" ? "ar" : "en";
  const purpose =
    body.purpose === "issue" || body.purpose === "suggestion"
      ? body.purpose
      : "general";
  const name = normalizeSingleLine(body.name);
  const email = normalizeSingleLine(body.email).toLowerCase();
  const subject = normalizeSingleLine(body.subject);
  const message = normalizeMessage(body.message);
  const website = normalizeSingleLine(body.website);

  if (name.length < 2) {
    return apiError("NAME_REQUIRED", "A contact name is required.", 400);
  }
  if (name.length > NAME_MAX_LENGTH) {
    return apiError("NAME_TOO_LONG", "Contact name is too long.", 400);
  }
  if (!email) {
    return apiError("EMAIL_REQUIRED", "A reply email is required.", 400);
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return apiError("EMAIL_TOO_LONG", "Reply email is too long.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    return apiError("EMAIL_INVALID", "Reply email must be valid.", 400);
  }
  if (subject.length < 4) {
    return apiError("SUBJECT_REQUIRED", "A subject is required.", 400);
  }
  if (subject.length > SUBJECT_MAX_LENGTH) {
    return apiError("SUBJECT_TOO_LONG", "Subject is too long.", 400);
  }
  if (message.length < 12) {
    return apiError("MESSAGE_REQUIRED", "A message is required.", 400);
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    return apiError("MESSAGE_TOO_LONG", "Message is too long.", 400);
  }

  // This honeypot belongs only to the public Contact route.
  // It gives us a minimal abuse guard without adding new product flows or exposing private email handling.
  // Future agents should keep it silent so obvious bots do not learn how to bypass the form.
  if (website) {
    return apiSuccess(
      {
        submissionId: crypto.randomUUID(),
      },
      202,
    );
  }

  if (!hasContactMailConfiguration()) {
    return apiError(
      "CONTACT_NOT_CONFIGURED",
      "The contact email relay is not configured in this environment yet.",
      503,
    );
  }

  try {
    // This route is intentionally tiny and server-only.
    // It exists so the public Contact page can submit messages without exposing the private destination email or provider credentials in the browser.
    const result = await sendPlatformContactEmail({
      locale,
      name,
      email,
      purpose,
      subject,
      message,
    });

    return apiSuccess(
      {
        submissionId: result.id ?? crypto.randomUUID(),
      },
      201,
    );
  } catch (error) {
    console.error("Contact form relay failed.", error);
    return apiError(
      "CONTACT_SEND_FAILED",
      "The contact message could not be sent right now.",
      502,
    );
  }
}
