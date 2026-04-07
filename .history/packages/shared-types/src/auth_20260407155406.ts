export type UserRole = "admin" | "user";
export type UserStatus = "active" | "suspended";
export type ThemeMode = "light" | "dark" | "system";
export type Locale = "en" | "ar";

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  fullName: string | null;
  universityCode: string | null;
  phoneNumber: string | null;
  phoneVerifiedAt: string | null;
  nationality: string | null;
  originCountry: string | null;
  profileCompleted: boolean;
  profileCompletedAt: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface SessionSnapshot {
  authenticated: boolean;
  user: SessionUser | null;
}
