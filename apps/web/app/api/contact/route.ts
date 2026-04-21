import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  ContactAttachmentValidationError,
  extractContactAttachmentFiles,
  readValidatedContactAttachments,
} from "@/lib/server/contact-attachments";
import {
  hasContactMailConfiguration,
  sendPlatformContactEmail,
} from "@/lib/server/contact-mail";

export const runtime = "nodejs";

const CONTACT_RATE_LIMIT_MAX_REQUESTS = 5;
const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type ContactRouteBody = {
  locale?: unknown;
  name?: unknown;
  email?: unknown;
  purpose?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

type ParsedContactRequest = {
  locale: "en" | "ar";
  purpose: "general" | "issue" | "suggestion";
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
  attachmentFiles: File[];
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

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function classifyContactBodyParseFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/too large|entity too large|payload too large|body exceeded/i.test(message)) {
    return {
      code: "CONTACT_REQUEST_TOO_LARGE",
      message:
        "The contact form payload exceeded the server body limit before it could be processed.",
      status: 413,
    } as const;
  }

  return {
    code: "CONTACT_FORM_INVALID",
    message: "The contact form payload could not be processed.",
    status: 400,
  } as const;
}

async function parseContactRequest(request: Request): Promise<ParsedContactRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    let body: ContactRouteBody;

    try {
      body = (await request.json()) as ContactRouteBody;
    } catch {
      throw apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    return {
      locale: body.locale === "ar" ? "ar" : "en",
      purpose:
        body.purpose === "issue" || body.purpose === "suggestion"
          ? body.purpose
          : "general",
      name: normalizeSingleLine(body.name),
      email: normalizeSingleLine(body.email).toLowerCase(),
      subject: normalizeSingleLine(body.subject),
      message: normalizeMessage(body.message),
      website: normalizeSingleLine(body.website),
      attachmentFiles: [] as File[],
    };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const classified = classifyContactBodyParseFailure(error);
    throw apiError(classified.code, classified.message, classified.status);
  }

  const locale = readFormValue(formData, "locale") === "ar" ? "ar" : "en";
  const rawPurpose = readFormValue(formData, "purpose");
  const purpose =
    rawPurpose === "issue" || rawPurpose === "suggestion" ? rawPurpose : "general";

  return {
    locale,
    purpose,
    name: normalizeSingleLine(readFormValue(formData, "name")),
    email: normalizeSingleLine(readFormValue(formData, "email")).toLowerCase(),
    subject: normalizeSingleLine(readFormValue(formData, "subject")),
    message: normalizeMessage(readFormValue(formData, "message")),
    website: normalizeSingleLine(readFormValue(formData, "website")),
    attachmentFiles: extractContactAttachmentFiles(formData),
  };
}

export async function POST(request: Request) {
  let parsedRequest: ParsedContactRequest;

  try {
    parsedRequest = await parseContactRequest(request);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (error instanceof ContactAttachmentValidationError) {
      return apiError(error.code, error.message, error.status, {
        attachments: error.message,
      });
    }

    throw error;
  }

  const locale = parsedRequest.locale;
  const purpose = parsedRequest.purpose;
  const name = parsedRequest.name;
  const email = parsedRequest.email;
  const subject = parsedRequest.subject;
  const message = parsedRequest.message;
  const website = parsedRequest.website;

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

  // Public contact submissions remain unauthenticated, so the route itself must add a
  // small server-side pacing guard. Keep this after the silent honeypot but before the
  // mail relay so attachment-enabled spam cannot hammer SMTP delivery unchecked.
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "public-contact",
    maxRequests: CONTACT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const response = apiError(
      "CONTACT_RATE_LIMITED",
      "Too many contact submissions were sent from this client. Please try again shortly.",
      429,
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  let attachments;
  try {
    attachments = await readValidatedContactAttachments(parsedRequest.attachmentFiles);
  } catch (error) {
    if (error instanceof ContactAttachmentValidationError) {
      return apiError(error.code, error.message, error.status, {
        attachments: error.message,
      });
    }

    throw error;
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
      attachments,
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
