"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  ASSESSMENT_CREDIT_SUMMARY_GC_TIME_MS,
  ASSESSMENT_CREDIT_SUMMARY_STALE_TIME_MS,
} from "@/lib/assessment-credit-query";

type ProtectedWorkspaceQueryProviderProps = {
  children: ReactNode;
};

export function ProtectedWorkspaceQueryProvider({
  children,
}: ProtectedWorkspaceQueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: ASSESSMENT_CREDIT_SUMMARY_STALE_TIME_MS,
            gcTime: ASSESSMENT_CREDIT_SUMMARY_GC_TIME_MS,
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  /* This provider is scoped to protected pages so credit/header/assessment cache ownership stays
     in one authenticated tree. Future agents should reuse this provider for protected shared state
     instead of introducing parallel per-page query clients that can drift. */
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
