import type { Locale, ThemeMode, UserRole, UserStatus } from "./auth";

export interface UserPreferences {
  theme: ThemeMode;
  language: Locale;
}

export interface RequiredUserProfile {
  fullName: string;
  universityCode: string;
  nationality: string;
}

export interface UpdateUserProfileInput extends RequiredUserProfile {
  phoneNumber?: string | null;
  phoneCountryIso2?: string | null;
  phoneCountryCallingCode?: string | null;
}

export interface UserProfileFieldErrors {
  fullName?: string;
  universityCode?: string;
  phoneNumber?: string;
  nationality?: string;
}

export interface UserDocument {
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
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileResponse {
  user: UserDocument;
  redirectTo: string;
}
