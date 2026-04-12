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

export interface UserServerObservedRequestGeoMetadata {
  source: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface UserServerObservedSignInMetadata {
  nonAuthoritative: true;
  observedAt: string;
  publicIp: string | null;
  forwardedIpChain: string[] | null;
  acceptLanguage: string | null;
  requestGeo: UserServerObservedRequestGeoMetadata | null;
}

export interface UserClientBestEffortUserAgentDataHints {
  brands: string[] | null;
  mobile: boolean | null;
  platform: string | null;
  architecture: string | null;
  bitness: string | null;
  model: string | null;
  platformVersion: string | null;
  uaFullVersion: string | null;
  wow64: boolean | null;
  fullVersionList: string[] | null;
}

export interface UserClientBestEffortScreenMetadata {
  width: number | null;
  height: number | null;
  pixelRatio: number | null;
  colorDepth: number | null;
}

export interface UserClientBestEffortViewportMetadata {
  width: number | null;
  height: number | null;
}

export interface UserClientBestEffortNetworkMetadata {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
}

export interface UserClientBestEffortSignInMetadata {
  nonAuthoritative: true;
  capturedAt: string;
  userAgent: string | null;
  browser: string | null;
  operatingSystem: string | null;
  platform: string | null;
  language: string | null;
  languages: string[] | null;
  timezone: string | null;
  maxTouchPoints: number | null;
  touchCapable: boolean | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  userAgentData: UserClientBestEffortUserAgentDataHints | null;
  screen: UserClientBestEffortScreenMetadata | null;
  viewport: UserClientBestEffortViewportMetadata | null;
  network: UserClientBestEffortNetworkMetadata | null;
  approximateDeviceLabel: string | null;
  approximateDeviceLabelSource: string | null;
  approximateDeviceLabelConfidence: number | null;
}

export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  serverObservedSignInMetadata: UserServerObservedSignInMetadata | null;
  clientBestEffortSignInMetadata: UserClientBestEffortSignInMetadata | null;
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
