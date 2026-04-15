import type { AppMessages } from "@/lib/messages";
import type {
  AuthStatusDescriptor,
  AuthSupportNote,
} from "@/components/auth/auth-feedback";

export type OperationalUiError = {
  message: string;
  showSupport: boolean;
};

export function createOperationalUiError(
  message: string,
  showSupport: boolean,
): OperationalUiError {
  return {
    message,
    showSupport,
  };
}

export function getOperationalSupportNotes(
  messages: Pick<AppMessages, "operationalSupportDeveloperNote">,
): AuthSupportNote[] {
  return [
    {
      text: messages.operationalSupportDeveloperNote,
      tone: "danger",
    },
  ];
}

export function withOperationalSupport(
  status: AuthStatusDescriptor,
  messages: Pick<AppMessages, "operationalSupportDetailsLabel" | "operationalSupportDeveloperNote">,
): AuthStatusDescriptor {
  return {
    ...status,
    supportLabel: messages.operationalSupportDetailsLabel,
    supportNotes: getOperationalSupportNotes(messages),
  };
}
