import type { ReactNode } from "react";

import { ProtectedShell } from "@/components/layout/protected-shell";
import { ProtectedWorkspaceQueryProvider } from "@/components/layout/protected-workspace-query-provider";
import { ProtectedWorkspaceBackground } from "@/components/layout/protected-workspace-background";
import { getAssessmentCreditRealtimeTopic } from "@/lib/server/assessment-credit-live-updates";
import { getRequestUiContext } from "@/lib/server/request-context";
import { requireAuthenticatedUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [user, uiContext] = await Promise.all([
    requireAuthenticatedUser(),
    getRequestUiContext(),
  ]);
  const assessmentCreditRealtimeTopic =
    getAssessmentCreditRealtimeTopic(user.uid);

  return (
    <div className="relative min-h-screen">
      {/* This route-group layout is the only shared owner of the protected workspace background.
          Future agents should extend protected visuals here instead of touching public auth pages. */}
      <ProtectedWorkspaceBackground />

      <div className="relative z-10">
        <ProtectedWorkspaceQueryProvider>
          <ProtectedShell
            user={user}
            locale={uiContext.locale}
            themeMode={uiContext.themeMode}
            messages={uiContext.messages}
            assessmentCreditRealtimeTopic={assessmentCreditRealtimeTopic}
          >
            {children}
          </ProtectedShell>
        </ProtectedWorkspaceQueryProvider>
      </div>
    </div>
  );
}
