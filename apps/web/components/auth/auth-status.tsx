import {
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  Info,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import type {
  AuthStatusDescriptor,
  AuthStatusIcon,
  AuthSupportNote,
} from "@/components/auth/auth-feedback";

const ICON_MAP: Record<AuthStatusIcon, typeof Info> = {
  info: Info,
  working: LoaderCircle,
  success: CircleCheckBig,
  warning: TriangleAlert,
  danger: CircleAlert,
  permission: ShieldAlert,
  config: Wrench,
};

export function AuthStatus({
  status,
}: {
  status: AuthStatusDescriptor | null;
}) {
  if (!status) {
    return null;
  }

  const Icon = ICON_MAP[status.icon];
  const liveMode =
    status.live ?? (status.tone === "danger" ? "assertive" : "polite");
  const role = liveMode === "off" ? undefined : status.tone === "danger" ? "alert" : "status";

  return (
    <div
      className={`auth-status auth-status--${status.tone}`}
      aria-live={liveMode}
      role={role}
    >
      <span className="auth-status-icon-wrap" aria-hidden="true">
        <Icon
          className={`auth-status-icon${status.icon === "working" ? " animate-spin" : ""}`}
        />
      </span>
      <div className="auth-status-copy">
        <p className="auth-status-title">{status.title}</p>
        {status.body ? <p className="auth-status-body">{status.body}</p> : null}
      </div>
    </div>
  );
}

export function AuthSupportDetails({
  label,
  notes,
}: {
  label: string;
  notes: AuthSupportNote[];
}) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <details className="auth-support-details">
      <summary className="auth-support-summary">
        <span>{label}</span>
        <ChevronDown className="auth-support-summary-icon" aria-hidden="true" />
      </summary>
      <div className="auth-support-details-body">
        <div className="auth-support-stack">
          {notes.map((note) => (
            <p
              key={`${note.tone ?? "default"}:${note.text}`}
              className={`auth-support-note${
                note.tone === "danger" ? " auth-support-note--danger" : ""
              }`}
            >
              {note.text}
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}
