import type { Locale, ThemeMode, UserRole, UserStatus } from "./auth";

export interface UserPreferences {
  theme: ThemeMode;
  language: Locale;
}

export interface RequiredUserProfile {
  fullName: string;
  universityCode: string;
  nationality: string;
  originCountry: string;
}

export interface UpdateUserProfileInput extends RequiredUserProfile {}

export interface UserProfileFieldErrors {
  fullName?: string;
  universityCode?: string;
  phoneNumber?: string;
  nationality?: string;
  originCountry?: string;
}

export interface UserDocument {
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
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileResponse {
  user: UserDocument;
  redirectTo: string;
}
