import "server-only";

import type {
  AssessmentGeneration,
  AssessmentQuestion,
  AssessmentRequest,
  InfographicGeneration,
  InfographicRequest,
} from "@zootopia/shared-types";
import { randomUUID } from "node:crypto";

import { getModelById } from "@/lib/ai/models";
import { buildToolPrompt } from "@/lib/server/ai/prompt-orchestrator";
import { resolveProviderRuntime } from "@/lib/server/ai/provider-runtime";

function splitPromptIntoFragments(value: string) {
  return value
    .split(/[\n,.!?;:]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAssessmentQuestions(input: {
  prompt: string;
  questionCount: number;
  difficulty: AssessmentRequest["difficulty"];
  documentContext?: string | null;
}): AssessmentQuestion[] {
  const source = [
    ...splitPromptIntoFragments(input.prompt),
    ...splitPromptIntoFragments(input.documentContext || ""),
  ];

  const fallbackTopics = source.length > 0 ? source : ["core concept review"];

  return Array.from({ length: input.questionCount }, (_, index) => {
    const topic = fallbackTopics[index % fallbackTopics.length]!;
    return {
      question: `Question ${index + 1}: Explain the scientific importance of ${topic}.`,
      answer: `Model answer (${input.difficulty}): connect ${topic} to the core learning objective, define it clearly, and mention one practical application or implication.`,
    };
  });
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildInfographicSvg(input: {
  topic: string;
  style: InfographicRequest["style"];
  modelLabel: string;
  promptSummary: string;
}) {
  const title = escapeSvgText(input.topic);
  const subtitle = escapeSvgText(input.promptSummary.slice(0, 120));
  const accent =
    input.style === "bold" ? "#0f766e" : input.style === "balanced" ? "#15803d" : "#0f766e";
  const surface = input.style === "academic" ? "#ecfeff" : "#f0fdf4";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="${surface}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="720" rx="40" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="600" rx="32" fill="white" stroke="${accent}" stroke-width="4" />
  <circle cx="170" cy="160" r="52" fill="${accent}" opacity="0.12" />
  <circle cx="1030" cy="560" r="72" fill="${accent}" opacity="0.12" />
  <text x="120" y="170" fill="#0f172a" font-size="52" font-family="Arial, sans-serif" font-weight="700">${title}</text>
  <text x="120" y="230" fill="#334155" font-size="24" font-family="Arial, sans-serif">${escapeSvgText(input.modelLabel)}</text>
  <text x="120" y="300" fill="#0f172a" font-size="28" font-family="Arial, sans-serif">Key message</text>
  <text x="120" y="348" fill="#475569" font-size="24" font-family="Arial, sans-serif">${subtitle}</text>
  <rect x="120" y="410" width="420" height="160" rx="24" fill="#f8fafc" />
  <rect x="580" y="410" width="500" height="160" rx="24" fill="#f8fafc" />
  <text x="150" y="465" fill="${accent}" font-size="24" font-family="Arial, sans-serif">Structure</text>
  <text x="150" y="510" fill="#334155" font-size="22" font-family="Arial, sans-serif">1. Define the concept clearly</text>
  <text x="150" y="545" fill="#334155" font-size="22" font-family="Arial, sans-serif">2. Highlight the scientific mechanism</text>
  <text x="150" y="580" fill="#334155" font-size="22" font-family="Arial, sans-serif">3. Show a practical implication</text>
  <text x="610" y="465" fill="${accent}" font-size="24" font-family="Arial, sans-serif">Presentation note</text>
  <text x="610" y="510" fill="#334155" font-size="22" font-family="Arial, sans-serif">Use short bullets and strong visual hierarchy.</text>
  <text x="610" y="545" fill="#334155" font-size="22" font-family="Arial, sans-serif">This SVG is a local fallback while provider runtime is</text>
  <text x="610" y="580" fill="#334155" font-size="22" font-family="Arial, sans-serif">still being connected to external AI generation.</text>
</svg>`.trim();
}

export async function generateAssessment(input: {
  ownerUid: string;
  request: AssessmentRequest;
  documentContext?: string | null;
}): Promise<AssessmentGeneration> {
  const model = getModelById(input.request.modelId);
  const runtime = resolveProviderRuntime(model.id);
  const prompt = buildToolPrompt({
    tool: "assessment",
    userPrompt: input.request.prompt,
    modelLabel: model.label,
    documentContext: input.documentContext,
    settings: {
      difficulty: input.request.difficulty,
      questionCount: input.request.questionCount,
      providerConfigured: runtime.configured ? "yes" : "no",
    },
  });

  return {
    id: randomUUID(),
    ownerUid: input.ownerUid,
    title: `Assessment for ${input.request.prompt.slice(0, 48) || "science topic"}`,
    modelId: model.id,
    questions: buildAssessmentQuestions({
      prompt,
      questionCount: input.request.questionCount,
      difficulty: input.request.difficulty,
      documentContext: input.documentContext,
    }),
    createdAt: new Date().toISOString(),
  };
}

export async function generateInfographic(input: {
  ownerUid: string;
  request: InfographicRequest;
  documentContext?: string | null;
}): Promise<InfographicGeneration> {
  const model = getModelById(input.request.modelId);
  const prompt = buildToolPrompt({
    tool: "infographic",
    userPrompt: input.request.topic,
    modelLabel: model.label,
    documentContext: input.documentContext,
    settings: {
      style: input.request.style,
    },
  });

  return {
    id: randomUUID(),
    ownerUid: input.ownerUid,
    topic: input.request.topic,
    modelId: model.id,
    imageSvg: buildInfographicSvg({
      topic: input.request.topic,
      style: input.request.style,
      modelLabel: model.label,
      promptSummary: prompt,
    }),
    createdAt: new Date().toISOString(),
  };
}
