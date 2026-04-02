import type { ReactNode } from "react";

import { ProtectedShell } from "@/components/layout/protected-shell";
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

  
  return (
    <div className="relative min-h-screen">
      {/* Shared Deep Space Grid Background */}
      <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#0a0f18]">
        <div className="absolute inset-0 bg-[url('/my-app-background.png')] bg-cover bg-center bg-fixed bg-no-repeat opacity-[0.25] dark:opacity-[0.10]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background/95 backdrop-blur-[2px]" />
      </div>

      <ProtectedShell 
           user={user} 
           locale={uiContext.locale} 
           themeMode={uiContext.themeMode} 
           messages={uiContext.messages}
      >
        {children}
      </ProtectedShell>
    </div>
  );
}
