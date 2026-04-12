export type UserRole = "admin" | "user";
export type UserStatus = "active" | "suspended";
export type ThemeMode = "light" | "dark" | "system";
export type Locale = "en" | "ar";

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
  fullName: string | null;
  universityCode: string | null;
  phoneNumber: string | null;
  phoneCountryIso2: string | null;
  phoneCountryCallingCode: string | null;
  nationality: string | null;
  profileCompleted: boolean;
  profileCompletedAt: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface SessionSnapshot {
  authenticated: boolean;
  user: SessionUser | null;
}
