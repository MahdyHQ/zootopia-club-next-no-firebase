"use client";

import type {
  AiModelDescriptor,
  ApiResult,
  AssessmentGeneration,
  AssessmentRequest,
  DocumentRecord,
} from "@zootopia/shared-types";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { AppMessages } from "@/lib/messages";

import { UploadWorkspace } from "@/components/upload/upload-workspace";

type AssessmentStudioProps = {
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: AssessmentGeneration[];
};

export function AssessmentStudio({
  messages,
  models,
  initialDocuments,
  initialGenerations,
}: AssessmentStudioProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [generations, setGenerations] = useState(initialGenerations);
  const [request, setRequest] = useState<AssessmentRequest>({
    prompt: "",
    questionCount: 6,
    difficulty: "medium",
    modelId: models[0]?.id ?? "google-balanced",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestGeneration = generations[0] ?? null;
  const documentOptions = useMemo(() => documents.slice(0, 20), [documents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/assessment", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<AssessmentGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "ASSESSMENT_FAILED" : payload.error.message);
      }

      setGenerations((current) => [payload.data, ...current]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Assessment generation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8 animate-float translate-y-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Input Form Section */}
        <section className="surface-strong relative overflow-hidden rounded-[2rem] p-8 shadow-sm">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent opacity-[0.06] blur-3xl" />
          
          <div className="relative z-10 flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <p className="section-label text-accent">{messages.assessmentTitle}</p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                {messages.assessmentSubtitle}
              </h2>
            </div>
          </div>

          <form className="relative z-10 mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="group">
              <label htmlFor="assessment-prompt" className="field-label group-focus-within:text-accent transition-colors">
                {messages.assessmentPromptLabel}
              </label>
              <textarea
                id="assessment-prompt"
                value={request.prompt}
                required
                rows={5}
                placeholder="E.g., Generate a quiz about cellular biology based on the uploaded lecture..."
                onChange={(event) =>
                  setRequest((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                className="field-control resize-y"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="group">
                <label htmlFor="assessment-count" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.assessmentQuestionCount}
                </label>
                <div className="relative">
                  <select
                    id="assessment-count"
                    value={request.questionCount}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        questionCount: Number(event.target.value),
                      }))
                    }
                    className="field-control appearance-none"
                  >
                    {[4, 6, 8, 10].map((count) => (
                      <option key={count} value={count}>
                        {count} Questions
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <label htmlFor="assessment-difficulty" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.assessmentDifficulty}
                </label>
                <div className="relative">
                  <select
                    id="assessment-difficulty"
                    value={request.difficulty}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        difficulty: event.target.value as AssessmentRequest["difficulty"],
                      }))
                    }
                    className="field-control appearance-none"
                  >
                    <option value="easy">{messages.difficultyEasy}</option>
                    <option value="medium">{messages.difficultyMedium}</option>
                    <option value="hard">{messages.difficultyHard}</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="group">
                <label htmlFor="assessment-model" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.modelLabel}
                </label>
                <div className="relative">
                  <select
                    id="assessment-model"
                    value={request.modelId}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        modelId: event.target.value,
                      }))
                    }
                    className="field-control appearance-none font-mono text-sm"
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              <div className="group">
                <label htmlFor="assessment-document" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.documentContextLabel}
                </label>
                <div className="relative">
                  <select
                    id="assessment-document"
                    value={request.documentId || ""}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        documentId: event.target.value || undefined,
                      }))
                    }
                    className="field-control appearance-none"
                  >
                    <option value="">{messages.noLinkedDocument}</option>
                    {documentOptions.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.fileName}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                type="submit" 
                disabled={pending || !request.prompt.trim()} 
                className="relative flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 py-4 font-semibold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_rgba(16,185,129,0.3)]"
              >
                {pending ? (
                  <>
                    <div className="loading-spinner" />
                    {messages.loading}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    {messages.assessmentGenerate}
                  </>
                )}
              </button>
            </div>
            
            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 shrink-0" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            ) : null}
          </form>
        </section>

        {/* Preview Section */}
        <section className="flex flex-col rounded-[2rem] border border-border bg-background-elevated p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10 text-gold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <p className="section-label">{messages.assessmentLatestTitle}</p>
          </div>

          <div className="mt-6 flex-1">
            {pending ? (
              <div className="flex h-full flex-col items-center justify-center space-y-4 rounded-2xl border border-dashed border-border p-8 text-center bg-background/30">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/20 bg-accent/5">
                  <div className="loading-spinner text-accent h-6 w-6 border-[3px]" />
                </div>
                <div>
                  <p className="font-semibold text-foreground animate-pulse">Generating your assessment...</p>
                  <p className="text-sm text-foreground-muted mt-1">Applying AI models to extract knowledge</p>
                </div>
              </div>
            ) : latestGeneration ? (
              <div className="space-y-5 animate-in fade-in duration-500">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                    {latestGeneration.title}
                  </h3>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {latestGeneration.questions.length} Questions
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
                      {latestGeneration.modelId}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {latestGeneration.questions.map((question, index) => (
                    <article
                      key={`${latestGeneration.id}-${index + 1}`}
                      className="group relative overflow-hidden rounded-2xl border border-border-strong bg-background-strong p-5 transition-all hover:border-accent/40 hover:shadow-sm"
                    >
                      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-accent to-accent/20 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="flex items-start gap-4">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                          Q{index + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          <p className="font-semibold text-foreground text-[0.95rem] leading-relaxed">
                            {question.question}
                          </p>
                          <div className="rounded-xl bg-foreground-muted/5 p-4 border border-border">
                            <p className="text-sm leading-relaxed text-foreground-muted">
                              <span className="font-semibold text-foreground mr-2">Answer:</span>
                              {question.answer}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-background/30">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mb-4 h-12 w-12 text-foreground-muted/30" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <p className="font-medium text-foreground-muted">{messages.assessmentEmpty}</p>
                <p className="text-sm text-foreground-muted/70 mt-1 max-w-[250px]">
                  Fill out the form to generate a new custom assessment.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Upload Integration */}
      <UploadWorkspace
        messages={messages}
        initialDocuments={documents}
        onDocumentCreated={(document) => {
          setDocuments((current) => [document, ...current]);
          setRequest((current) => ({
            ...current,
            documentId: document.id,
          }));
        }}
        title={messages.uploadWorkspaceTitle}
        description={messages.uploadHint}
      />

      {/* Assessment History */}
      <section className="surface-strong rounded-[2rem] p-8">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="section-label">{messages.assessmentHistoryTitle}</p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-[1.75rem] font-bold tracking-tight">
              {messages.recentAssessmentsTitle}
            </h3>
          </div>
        </div>
        
        <div className="mt-6">
          {generations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center text-sm font-medium text-foreground-muted">
              {messages.assessmentEmpty}
            </div>
          ) : (
            <div className="grid gap-3">
              {generations.map((generation) => (
                <div
                  key={generation.id}
                  className="group flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-background-elevated px-6 py-4 transition-all hover:border-accent hover:shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground group-hover:text-accent transition-colors">
                        {generation.title}
                      </p>
                      <p className="text-sm text-foreground-muted mt-1">
                        {generation.questions.length} questions • {new Date(generation.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-border-strong bg-background-strong px-3 py-1 font-mono text-xs text-foreground-muted">
                    {generation.modelId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
