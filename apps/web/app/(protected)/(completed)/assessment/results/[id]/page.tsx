import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";

import { AssessmentPreviewShell } from "@/components/assessment/assessment-preview-shell";
import { resolveAssessmentFileThemeMode } from "@/lib/assessment-file-branding";
import { buildAssessmentPreview } from "@/lib/server/assessment-preview";
import { buildAssessmentFileQrDataUrl } from "@/lib/server/assessment-file-qr";
import {
  appendAdminLog,
  getAssessmentGenerationForOwner,
} from "@/lib/server/repository";
import { getRequestUiContext } from "@/lib/server/request-context";
import { requireCompletedUser } from "@/lib/server/session";

function renderUnavailableCard(input: {
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-background-elevated/90 p-8 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight">{input.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">{input.body}</p>
      <Link
        href={APP_ROUTES.assessment}
        className="mt-6 inline-flex rounded-full border border-border-strong bg-background-strong px-4 py-2 text-sm font-semibold"
      >
        {input.cta}
      </Link>
    </section>
  );
}

export default async function AssessmentResultPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const [{ id }, searchParams, user, uiContext, qrCodeDataUrl] = await Promise.all([
    props.params,
    props.searchParams,
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
    buildAssessmentFileQrDataUrl(),
  ]);
  const generation = await getAssessmentGenerationForOwner(id, user.uid, {
    includeExpired: true,
  });

  if (!generation) {
    return renderUnavailableCard({
      title: uiContext.messages.assessmentUnavailableTitle,
      body: uiContext.messages.assessmentUnavailableBody,
      cta: uiContext.messages.backToAssessmentStudio,
    });
  }

  if (generation.status === "expired") {
    return renderUnavailableCard({
      title: uiContext.messages.assessmentExpiredTitle,
      body: uiContext.messages.assessmentExpiredBody,
      cta: uiContext.messages.backToAssessmentStudio,
    });
  }

  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "assessment-result-opened",
    resourceType: "assessment",
    resourceId: generation.id,
    route: "/assessment/results/[id]",
  });

  return (
    <div className="space-y-6">
      <AssessmentPreviewShell
        messages={uiContext.messages}
        preview={buildAssessmentPreview({
          generation,
          locale: uiContext.locale,
          messages: uiContext.messages,
        })}
        initialThemeMode={resolveAssessmentFileThemeMode(
          searchParams.theme,
          uiContext.themeMode === "light" ? "light" : "dark",
        )}
        qrCodeDataUrl={qrCodeDataUrl}
        view="result"
      />
    </div>
  );
}
