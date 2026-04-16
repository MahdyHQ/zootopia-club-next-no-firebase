"use client";

import {
  useQuery,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  ApiResult,
  AssessmentDailyCreditsSummary,
} from "@zootopia/shared-types";

import { logAssessmentCreditClientDiagnostic } from "@/lib/assessment-credit-diagnostics";

const ASSESSMENT_CREDIT_REQUEST_ID_HEADER =
  "x-zootopia-assessment-credit-request-id";

export const ASSESSMENT_CREDIT_SUMMARY_QUERY_KEY =
  ["assessment-credit-summary"] as const;

type AssessmentCreditSummaryResponse = {
  credits: AssessmentDailyCreditsSummary;
};

type AssessmentCreditSummaryQueryError = Error & {
  code?: string;
};

type UseAssessmentCreditSummaryQueryInput = {
  source: string;
  enabled?: boolean;
  refetchIntervalMs?: number | false;
};

async function fetchAssessmentCreditSummary(input: {
  source: string;
}): Promise<AssessmentDailyCreditsSummary> {
  const response = await fetch("/api/assessment/credits", {
    method: "GET",
    cache: "no-store",
  });
  const requestId = response.headers.get(ASSESSMENT_CREDIT_REQUEST_ID_HEADER) ?? null;

  let payload: ApiResult<AssessmentCreditSummaryResponse> | null = null;
  try {
    payload = (await response.json()) as ApiResult<AssessmentCreditSummaryResponse>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.ok) {
    const errorCode = payload && !payload.ok
      ? payload.error.code
      : "ASSESSMENT_CREDIT_SUMMARY_UNAVAILABLE";
    const errorMessage = payload && !payload.ok
      ? payload.error.message
      : "Unable to load assessment credits right now.";

    logAssessmentCreditClientDiagnostic({
      event: "assessment_credit_query_failed",
      details: {
        source: input.source,
        requestId,
        status: response.status,
        errorCode,
      },
    });

    throw Object.assign(new Error(errorMessage), {
      code: errorCode,
    }) as AssessmentCreditSummaryQueryError;
  }

  logAssessmentCreditClientDiagnostic({
    event: "assessment_credit_query_result",
    details: {
      source: input.source,
      requestId,
      remainingCount: payload.data.credits.remainingCount,
      assessmentAccess: payload.data.credits.assessmentAccess,
    },
  });

  return payload.data.credits;
}

export function useAssessmentCreditSummaryQuery(
  input: UseAssessmentCreditSummaryQueryInput,
): UseQueryResult<AssessmentDailyCreditsSummary, AssessmentCreditSummaryQueryError> {
  /* Protected shell chrome and Assessment Studio intentionally populate this shared query only by
     fetching canonical `/api/assessment/credits`. Future agents: do not reintroduce `initialData`
     or mutation-response cache writes here, or the header/studio can render a provisional balance
     before the authoritative read model finishes reconciling. */
  return useQuery<AssessmentDailyCreditsSummary, AssessmentCreditSummaryQueryError>({
    queryKey: ASSESSMENT_CREDIT_SUMMARY_QUERY_KEY,
    queryFn: () =>
      fetchAssessmentCreditSummary({
        source: input.source,
      }),
    enabled: input.enabled ?? true,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: input.refetchIntervalMs ?? false,
  });
}

export async function invalidateAssessmentCreditSummaryQuery(
  queryClient: QueryClient,
  input: {
    source: string;
    reason: string;
    details?: Record<string, unknown>;
  },
) {
  logAssessmentCreditClientDiagnostic({
    event: "assessment_credit_query_invalidation_requested",
    details: {
      source: input.source,
      reason: input.reason,
      ...(input.details ?? {}),
    },
  });

  await queryClient.invalidateQueries({
    queryKey: ASSESSMENT_CREDIT_SUMMARY_QUERY_KEY,
    refetchType: "active",
  });
}
