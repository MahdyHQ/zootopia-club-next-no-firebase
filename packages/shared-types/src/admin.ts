import type { UserDocument } from "./user";

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  totalAssessmentGenerations: number;
  totalInfographicGenerations: number;
}

export interface AdminUsersResponse {
  users: UserDocument[];
}

export type AdminIdentifierType = "email" | "username";
export type AdminIdentifierResolutionSource = "allowlisted_email" | "username_alias";

export interface AdminIdentifierResolution {
  email: string;
  identifierType: AdminIdentifierType;
  resolutionSource: AdminIdentifierResolutionSource;
}
