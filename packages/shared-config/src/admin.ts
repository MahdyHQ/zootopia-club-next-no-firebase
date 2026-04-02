import adminIdentities from "./admin-identities.json";

type AdminIdentityConfig = {
  emails: string[];
  explicitUsernameLookup?: Record<string, string>;
};

function normalizeAdminIdentifier(value: string) {
  return value.trim().toLowerCase();
}

const rawAdminIdentityConfig = adminIdentities as AdminIdentityConfig;

export const DEFAULT_ALLOWLISTED_ADMIN_EMAILS = Object.freeze(
  [...new Set(rawAdminIdentityConfig.emails.map(normalizeAdminIdentifier).filter(Boolean))],
) as readonly string[];

export const EXPLICIT_ADMIN_USERNAME_LOOKUP = Object.freeze(
  Object.fromEntries(
    Object.entries(rawAdminIdentityConfig.explicitUsernameLookup ?? {})
      .map(([username, email]) => [
        normalizeAdminIdentifier(username),
        normalizeAdminIdentifier(email),
      ])
      .filter(([username, email]) => username && email),
  ),
) as Readonly<Record<string, string>>;

export function buildAdminUsernameLookup(
  adminEmails: readonly string[] = DEFAULT_ALLOWLISTED_ADMIN_EMAILS,
) {
  const lookup = new Map<string, string>();

  for (const email of adminEmails) {
    const localPart = email.split("@")[0]?.trim().toLowerCase();
    if (localPart && !lookup.has(localPart)) {
      lookup.set(localPart, email);
    }
  }

  for (const [username, email] of Object.entries(EXPLICIT_ADMIN_USERNAME_LOOKUP)) {
    if (adminEmails.includes(email)) {
      lookup.set(username, email);
    }
  }

  return Object.freeze(Object.fromEntries(lookup)) as Readonly<Record<string, string>>;
}
