"use client";

import type {
  AiModelDescriptor,
  ApiResult,
  DocumentRecord,
  InfographicGeneration,
  InfographicRequest,
} from "@zootopia/shared-types";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { AppMessages } from "@/lib/messages";

import { DocumentContextCard } from "@/components/document/document-context-card";

type InfographicStudioProps = {
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: InfographicGeneration[];
};

export function InfographicStudio({
  messages,
  models,
  initialDocuments,
  initialGenerations,
}: InfographicStudioProps) {
  const [generations, setGenerations] = useState(initialGenerations);
  const [request, setRequest] = useState<InfographicRequest>({
    topic: "",
    style: "balanced",
    modelId: models[0]?.id ?? "google-balanced",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestGeneration = generations[0] ?? null;
  const documentOptions = useMemo(() => initialDocuments.slice(0, 20), [initialDocuments]);
  const selectedDocument =
    documentOptions.find((document) => document.id === request.documentId) ?? null;
  const latestDocument = documentOptions[0] ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/infographic", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<InfographicGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "INFOGRAPHIC_FAILED" : payload.error.message);
      }

      setGenerations((current) => [payload.data, ...current]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Infographic generation failed.",
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
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <div>
              <p className="section-label text-accent">{messages.infographicTitle}</p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                {messages.infographicSubtitle}
              </h2>
            </div>
          </div>

          <form className="relative z-10 mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="group">
              <label htmlFor="infographic-topic" className="field-label group-focus-within:text-accent transition-colors">
                {messages.infographicTopicLabel}
              </label>
              <textarea
                id="infographic-topic"
                value={request.topic}
                required
                rows={4}
                placeholder="Describe the scientific concept or data you want visualized..."
                onChange={(event) =>
                  setRequest((current) => ({
                    ...current,
                    topic: event.target.value,
                  }))
                }
                className="field-control resize-y"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="group">
                <label htmlFor="infographic-style" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.infographicStyleLabel}
                </label>
                <div className="relative">
                  <select
                    id="infographic-style"
                    value={request.style}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        style: event.target.value as InfographicRequest["style"],
                      }))
                    }
                    className="field-control appearance-none"
                  >
                    <option value="academic">{messages.styleAcademic}</option>
                    <option value="balanced">{messages.styleBalanced}</option>
                    <option value="bold">{messages.styleBold}</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <label htmlFor="infographic-model" className="field-label group-focus-within:text-accent transition-colors">
                  {messages.modelLabel}
                </label>
                <div className="relative">
                  <select
                    id="infographic-model"
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
            </div>

            <div className="group">
              <label htmlFor="infographic-document" className="field-label group-focus-within:text-accent transition-colors">
                {messages.documentContextLabel}
              </label>
              <div className="relative">
                <select
                  id="infographic-document"
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

            <div className="pt-4">
              <button 
                type="submit" 
                disabled={pending || !request.topic.trim()} 
                className="relative flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 py-4 font-semibold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_rgba(16,185,129,0.3)]"
              >
                {pending ? (
                  <>
                    <div className="loading-spinner" />
                    {messages.loading}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                    {messages.infographicGenerate}
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="m3 16 5-5c.8-.8 2-.8 2.8 0l2.2 2" />
                <path d="m21 13-3.1-3.1c-.8-.8-2-.8-2.8 0L9 16" />
              </svg>
            </div>
            <p className="section-label">{messages.infographicLatestTitle}</p>
          </div>

          <div className="mt-6 flex-1">
            {pending ? (
              <div className="flex h-full flex-col items-center justify-center space-y-4 rounded-2xl border border-dashed border-border p-8 text-center bg-background/30">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/20 bg-accent/5">
                  <div className="loading-spinner text-accent h-6 w-6 border-[3px]" />
                </div>
                <div>
                  <p className="font-semibold text-foreground animate-pulse">Rendering infographic...</p>
                  <p className="text-sm text-foreground-muted mt-1">Generating visual blueprints</p>
                </div>
              </div>
            ) : latestGeneration ? (
              <div className="space-y-5 animate-in fade-in duration-500">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground line-clamp-2">
                    {latestGeneration.topic}
                  </h3>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent">
                      {latestGeneration.modelId}
                    </span>
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-[1.5rem] border border-border bg-white shadow-sm transition-all hover:border-accent/40 hover:shadow-md">
                  <div
                    className="w-full overflow-auto object-contain flex items-center justify-center min-h-[300px]"
                    dangerouslySetInnerHTML={{ __html: latestGeneration.imageSvg }}
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-[1.5rem] pointer-events-none" />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-background/30">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mb-4 h-12 w-12 text-foreground-muted/30" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="m3 16 5-5c.8-.8 2-.8 2.8 0l2.2 2" />
                  <path d="m21 13-3.1-3.1c-.8-.8-2-.8-2.8 0L9 16" />
                </svg>
                <p className="font-medium text-foreground-muted">{messages.infographicEmpty}</p>
                <p className="text-sm text-foreground-muted/70 mt-1 max-w-[250px]">
                  Provide a topic to generate a new visualization.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <DocumentContextCard
        messages={messages}
        tone="infographic"
        selectedDocument={selectedDocument}
        latestDocument={latestDocument}
      />

      {/* Infographic History */}
      <section className="surface-strong rounded-[2rem] p-8">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="section-label">{messages.infographicHistoryTitle}</p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-[1.75rem] font-bold tracking-tight">
              {messages.recentInfographicsTitle}
            </h3>
          </div>
        </div>
        
        <div className="mt-6">
          {generations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center text-sm font-medium text-foreground-muted">
              {messages.infographicEmpty}
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
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="m3 16 5-5c.8-.8 2-.8 2.8 0l2.2 2" />
                        <path d="m21 13-3.1-3.1c-.8-.8-2-.8-2.8 0L9 16" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                        {generation.topic}
                      </p>
                      <p className="text-sm text-foreground-muted mt-1">
                        {messages.svgBlueprintReady} • {new Date(generation.createdAt).toLocaleDateString()}
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
