import "server-only";

type ToolKind = "assessment" | "infographic";

export function buildToolPrompt(input: {
  tool: ToolKind;
  userPrompt: string;
  modelLabel: string;
  documentContext?: string | null;
  settings?: Record<string, string | number>;
}) {
  const lines = [
    `Tool: ${input.tool}`,
    `Model lane: ${input.modelLabel}`,
  ];

  if (input.settings) {
    lines.push(
      `Settings: ${Object.entries(input.settings)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`,
    );
  }

  lines.push(`User request: ${input.userPrompt}`);

  if (input.documentContext) {
    lines.push(`Document context:\n${input.documentContext}`);
  }

  return lines.join("\n\n");
}
