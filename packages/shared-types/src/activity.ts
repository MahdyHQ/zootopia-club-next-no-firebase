import type { UserRole } from "./auth";

export type WorkspaceActivityKind =
  | "session_login"
  | "session_logout"
  | "upload_created"
  | "upload_downloaded"
  | "upload_deleted"
  | "upload_expired_cleanup"
  | "assessment_generated"
  | "assessment_deleted"
  | "assessment_expired_cleanup"
  | "assessment_export_json"
  | "assessment_export_markdown"
  | "assessment_export_docx"
  | "assessment_export_pdf_print"
  | "admin_user_role_changed"
  | "admin_user_status_changed";

export interface WorkspaceActivityLog {
  id: string;
  ownerUid: string;
  ownerRole: UserRole;
  ownerEmail: string | null;
  actorUid: string | null;
  actorRole: UserRole | "system";
  actorEmail: string | null;
  kind: WorkspaceActivityKind;
  targetId: string | null;
  documentId?: string | null;
  assessmentId?: string | null;
  fileName?: string | null;
  title?: string | null;
  createdAt: string;
}
