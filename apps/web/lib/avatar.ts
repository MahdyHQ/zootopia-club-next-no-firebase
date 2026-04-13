import type { SessionUser } from "@zootopia/shared-types";

type AvatarIdentity = Pick<
  SessionUser,
  "role" | "gender" | "displayName" | "fullName" | "email"
>;

const LOCAL_ROLE_GENDER_AVATARS = {
  admin: "/admin-avatar.png",
  female: "/female-avatar.png",
  male: "/male-avatar.png",
} as const;

/* Identity-avatar policy for protected surfaces:
   - admin role always wins and maps to the dedicated admin asset
   - non-admin users map to managed gender assets when known
   - unknown/missing gender intentionally falls back to an initial badge */
export function resolveRoleGenderAvatarSrc(
  user: Pick<SessionUser, "role" | "gender">,
): string | null {
  if (user.role === "admin") {
    return LOCAL_ROLE_GENDER_AVATARS.admin;
  }

  if (user.gender === "female") {
    return LOCAL_ROLE_GENDER_AVATARS.female;
  }

  if (user.gender === "male") {
    return LOCAL_ROLE_GENDER_AVATARS.male;
  }

  return null;
}

export function resolveAvatarFallbackInitial(user: AvatarIdentity): string {
  const identitySource =
    user.fullName?.trim()
    || user.displayName?.trim()
    || user.email?.trim()
    || "U";
  const firstCharacter = Array.from(identitySource)[0];

  if (!firstCharacter) {
    return "U";
  }

  return firstCharacter.toUpperCase();
}

export function resolveAvatarDisplayName(user: AvatarIdentity): string {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const emailLocalPart = user.email?.split("@")[0]?.trim();
  if (emailLocalPart) {
    return emailLocalPart;
  }

  return "User";
}