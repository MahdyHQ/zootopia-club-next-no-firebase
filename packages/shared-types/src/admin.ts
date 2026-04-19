import type {
  AssessmentCreditAccountAccess,
  AssessmentCreditAccountRecord,
  AssessmentCreditGrantAdminView,
  AssessmentDailyCreditsSummary,
} from "./assessment";
import type { UserRole } from "./auth";
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

export type AdminAssessmentCreditMutationAction =
  | "set_access"
  | "set_daily_override"
  | "clear_daily_override"
  | "add_manual_credits"
  | "subtract_manual_credits"
  | "set_manual_credits"
  | "grant_credits"
  | "revoke_grant";

export interface AdminAssessmentCreditMutationInput {
  action: AdminAssessmentCreditMutationAction;
  amount?: number;
  dailyLimitOverride?: number | null;
  access?: AssessmentCreditAccountAccess;
  expiresAt?: string | null;
  reason?: string;
  note?: string;
  grantId?: string;
}

export interface AdminAssessmentCreditState {
  ownerUid: string;
  account: AssessmentCreditAccountRecord;
  credits: AssessmentDailyCreditsSummary;
  grants: AssessmentCreditGrantAdminView[];
  history: AdminAssessmentCreditMutationRecord[];
}

export interface AdminAssessmentCreditMutationBalanceSnapshot {
  assessmentAccess: AssessmentCreditAccountAccess;
  dailyLimitOverride: number | null;
  manualCredits: number;
  dailyLimit: number;
  usedCount: number;
  remainingCount: number | null;
  grantCreditsAvailable: number;
  activeGrantCount: number;
}

export interface AdminAssessmentCreditMutationRecord {
  id: string;
  ownerUid: string;
  action: AdminAssessmentCreditMutationAction;
  amount: number | null;
  access: AssessmentCreditAccountAccess | null;
  dailyLimitOverride: number | null;
  grantId: string | null;
  expiresAt: string | null;
  reason: string | null;
  note: string | null;
  adminUid: string;
  adminEmail?: string | null;
  adminRole: UserRole;
  before: AdminAssessmentCreditMutationBalanceSnapshot;
  after: AdminAssessmentCreditMutationBalanceSnapshot;
  correlationId?: string | null;
  routeSource?: string | null;
  commitStatus?: string | null;
  createdAt: string;
}

export interface AdminUserAssessmentCreditsResponse {
  user: UserDocument;
  state: AdminAssessmentCreditState;
}

/* This owner-facing details payload still lives beside admin credit types because the richer
   history/grant records are shared with admin mutation views. Future refactors may move it into
   a dedicated assessment-credit file, but keep the contract assessment-scoped rather than
   rebranding it as a generic platform-wallet response before cross-tool crediting exists. */
export interface AssessmentCreditDetailsResponse {
  account: AssessmentCreditAccountRecord;
  credits: AssessmentDailyCreditsSummary;
  grants: AssessmentCreditGrantAdminView[];
  history: AdminAssessmentCreditMutationRecord[];
  computedAt: string;
}

export interface AdminUserDeletionStorageSummary {
  deletedDocumentObjects: number;
  deletedAssessmentArtifacts: number;
  deletedInfographicArtifacts: number;
  storageCleanupBestEffort: boolean;
}

export interface AdminUserDeletionDatabaseSummary {
  deletedDocuments: number;
  deletedAssessmentGenerations: number;
  deletedAssessmentArtifactMetadata: number;
  deletedInfographicGenerations: number;
  deletedCreditAccounts: number;
  deletedCreditGrants: number;
  deletedDailyCredits: number;
  deletedCreditMutationHistory: number;
  deletedIdempotencyKeys: number;
  deletedLegacyUserRecords: number;
}

export interface AdminUserDeletionSummary {
  action: "delete-user";
  targetUid: string;
  targetEmail: string | null;
  actingAdminUid: string;
  authAccountDeleted: boolean;
  database: AdminUserDeletionDatabaseSummary;
  storage: AdminUserDeletionStorageSummary;
  finalResult: "success" | "partial_failure";
  failurePoint: string | null;
  failureReason: string | null;
}

export interface AdminDeleteUserResponse {
  deletedUid: string;
  users: UserDocument[];
  summary: AdminUserDeletionSummary;
}
