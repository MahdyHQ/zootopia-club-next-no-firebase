import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  getZootopiaSql,
  hasZootopiaPostgresPersistence,
} from "@/lib/server/zootopia-postgres-adapter";

export type UserPasswordSecurityEventType = "recovery_reset" | "in_account_change";
export type UserPasswordSecurityEventSource = "recovery" | "settings";

export type UserPasswordSecurityEventRecordResult = {
  persisted: boolean;
  eventId: string | null;
};

const PASSWORD_SECURITY_HASH_SALT_ENV_KEYS = [
  "ZOOTOPIA_PASSWORD_SECURITY_HASH_SALT",
  "ZOOTOPIA_EMAIL_VERIFICATION_HASH_SALT",
] as const;

let hasWarnedAboutMissingPasswordSecurityHashSalt = false;

function readEnv(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function getPasswordSecurityHashSalt() {
  for (const envKey of PASSWORD_SECURITY_HASH_SALT_ENV_KEYS) {
    const value = readEnv(process.env[envKey]);
    if (value) {
      return value;
    }
  }

  if (!hasWarnedAboutMissingPasswordSecurityHashSalt) {
    hasWarnedAboutMissingPasswordSecurityHashSalt = true;
    console.warn(
      "[password-security-events] Missing hash-salt env configuration. "
        + "Set ZOOTOPIA_PASSWORD_SECURITY_HASH_SALT (preferred) for deterministic metadata hashing.",
    );
  }

  return "";
}

function getForwardedIp(value: string | null) {
  if (!value) {
    return "";
  }

  return value.split(",")[0]?.trim() ?? "";
}

function normalizeIpCandidate(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  // Keep IPv6 literals intact while still stripping host:port forms for IPv4 entries.
  if (trimmed.includes(":") && !trimmed.includes(".")) {
    return trimmed;
  }

  return trimmed.replace(/:\d+$/, "");
}

function getRequestIp(request: Request) {
  return (
    normalizeIpCandidate(request.headers.get("x-real-ip") ?? "")
    || normalizeIpCandidate(getForwardedIp(request.headers.get("x-forwarded-for")))
    || normalizeIpCandidate(request.headers.get("x-vercel-forwarded-for") ?? "")
    || normalizeIpCandidate(request.headers.get("cf-connecting-ip") ?? "")
  );
}

function hashValue(input: {
  scope: "ip" | "user_agent";
  value: string;
  salt: string;
}) {
  if (!input.value) {
    return null;
  }

  return createHash("sha256")
    .update(input.scope)
    .update("|")
    .update(input.salt)
    .update("|")
    .update(input.value)
    .digest("hex");
}

export async function recordUserPasswordSecurityEvent(input: {
  request: Request;
  uid: string;
  eventType: UserPasswordSecurityEventType;
  eventSource: UserPasswordSecurityEventSource;
  sessionHardeningAttempted: boolean;
  sessionHardeningSucceeded: boolean;
}): Promise<UserPasswordSecurityEventRecordResult> {
  if (!hasZootopiaPostgresPersistence()) {
    return {
      persisted: false,
      eventId: null,
    };
  }

  const uid = String(input.uid || "").trim();
  if (!uid) {
    return {
      persisted: false,
      eventId: null,
    };
  }

  const salt = getPasswordSecurityHashSalt();
  const eventId = randomUUID();
  const nowIso = new Date().toISOString();
  const ipHash = hashValue({
    scope: "ip",
    value: getRequestIp(input.request),
    salt,
  });
  const userAgentHash = hashValue({
    scope: "user_agent",
    value: String(input.request.headers.get("user-agent") ?? "").slice(0, 512),
    salt,
  });

  const sql = getZootopiaSql();

  try {
    await sql.begin(async (tx) => {
      const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

      await txSql`
        INSERT INTO public.user_password_security_events (
          id,
          uid,
          event_type,
          event_source,
          session_hardening_attempted,
          session_hardening_succeeded,
          ip_hash,
          user_agent_hash,
          created_at
        ) VALUES (
          ${eventId},
          ${uid},
          ${input.eventType},
          ${input.eventSource},
          ${input.sessionHardeningAttempted},
          ${input.sessionHardeningSucceeded},
          ${ipHash},
          ${userAgentHash},
          ${nowIso}
        )
      `;

      await txSql`
        INSERT INTO public.user_password_security_state (
          uid,
          last_event_id,
          last_event_type,
          last_event_source,
          last_password_changed_at,
          session_hardening_succeeded,
          created_at,
          updated_at
        ) VALUES (
          ${uid},
          ${eventId},
          ${input.eventType},
          ${input.eventSource},
          ${nowIso},
          ${input.sessionHardeningSucceeded},
          ${nowIso},
          ${nowIso}
        )
        ON CONFLICT (uid)
        DO UPDATE SET
          last_event_id               = EXCLUDED.last_event_id,
          last_event_type             = EXCLUDED.last_event_type,
          last_event_source           = EXCLUDED.last_event_source,
          last_password_changed_at    = EXCLUDED.last_password_changed_at,
          session_hardening_succeeded = EXCLUDED.session_hardening_succeeded,
          updated_at                  = EXCLUDED.updated_at
      `;
    });

    return {
      persisted: true,
      eventId,
    };
  } catch (error) {
    console.warn("[password-security-events] failed to persist password security event", {
      uid,
      eventType: input.eventType,
      eventSource: input.eventSource,
      error,
    });

    return {
      persisted: false,
      eventId: null,
    };
  }
}
