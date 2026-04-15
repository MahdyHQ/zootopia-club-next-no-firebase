# Zootopia Club Assessment Type-Oriented Generation, Normalization, Rendering, and Export System Guide

## Purpose

This document defines a complete, production-safe system for generating, normalizing, rendering, and exporting mixed assessment results in a type-aware way.

It is written so any future agent can implement, maintain, or extend the system without guessing.

The system must support user-selected question types such as:

- MCQ
- True / False
- Definition
- Terminology
- Short Answer
- Fill Blanks
- Comparison
- Scientific Term

The system must preserve the user’s requested configuration, pass it to the model, normalize the returned result, and render/export the final assessment in a grouped, professional, layout-safe way.

---

## Core Principle

The user selection is authoritative.

The model may return extra question types, malformed data, missing fields, or mixed structures. The system must **not fail the whole flow** because of that.

Instead, the system must:

1. Accept the raw model output.
2. Normalize it safely.
3. Ignore unselected or unwanted question types in the final grouped display/export.
4. Keep the flow alive even if some fields are incomplete.
5. Render blank placeholders where needed instead of crashing.
6. Preserve future maintainability by separating each question type into its own rendering and normalization path.

---

## End-to-End Flow

The full system must follow this chain:

`UI selection -> prompt orchestration -> model generation -> normalization -> typed metadata -> grouped rendering -> safe export`

Each layer has a clear responsibility.

---

## Layer 1: User Selection Input

### Required behavior

The assessment request must capture all selected question types and all related settings.

At minimum, the request payload should include:

- selected question types
- distribution per selected type
- total question count
- difficulty
- output language
- mode
- optional user prompt
- linked document context

### Example request shape

```ts
type AssessmentQuestionType =
  | "mcq"
  | "true_false"
  | "definition"
  | "terminology"
  | "short_answer"
  | "fill_blanks"
  | "comparison"
  | "scientific_term";

interface AssessmentGenerationRequest {
  linkedDocumentId: string;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
  outputLanguage: "en" | "ar";
  selectedQuestionTypes: AssessmentQuestionType[];
  questionTypeDistribution: Partial<Record<AssessmentQuestionType, number>>;
  userPrompt?: string;
  mode?: "question_generation" | "exam_generation";
}
```

### Rules

- The selected types must be passed explicitly to the model prompt.
- The distribution must be passed explicitly to the model prompt.
- The system must not rely on the UI alone. The backend must validate and own the final request contract.
- If the user selects only three types, only those three types should appear in the final rendered/exported result.

---

## Layer 2: Prompt Orchestration

### Required behavior

Prompt orchestration must explicitly tell the model:

- which question types are allowed
- which types are not allowed
- the expected distribution
- the expected metadata shape
- the desired output structure
- that mixed output must still be labeled by type

### Important instruction for the model

The prompt should request the model to return only the selected types, but the system must still be resilient if the model returns extras.

### Example orchestration requirements

The prompt should instruct the model to:

1. Generate only the requested question types.
2. Label each question with a canonical `questionType`.
3. Return structured data per question.
4. Group output logically by type or make grouping possible from metadata.
5. Include answer data and optional rationale when appropriate.
6. Avoid returning unsupported types.

### Important resilience rule

If the model still returns extra types, the system must **ignore them in final grouped rendering** instead of throwing an error.

Do not reject the full assessment because of one extra type.

---

## Layer 3: Raw Result Acceptance

### Required behavior

The system must store or process raw model output without assuming it is perfect.

The raw model result may contain:

- extra question types
- invalid field names
- missing answers
- missing options
- malformed ordering
- partial sections
- unexpected labels

The system must not break the pipeline because of this.

---

## Layer 4: Normalization Layer

## Objective

Convert raw model output into a clean internal typed structure.

This layer is mandatory.

### Normalization rules

For each question:

1. Resolve the canonical type.
2. Map aliases to the canonical type.
3. Drop unselected types from final grouped display/export output.
4. Keep valid selected questions even if some fields are incomplete.
5. Fill missing non-critical fields with defaults or blanks.
6. Preserve display and export safety.

### Canonical type mapping example

```ts
const CANONICAL_TYPE_ALIASES: Record<string, AssessmentQuestionType> = {
  mcq: "mcq",
  multiple_choice: "mcq",
  multiple_choice_question: "mcq",

  true_false: "true_false",
  true_false_question: "true_false",
  tf: "true_false",

  definition: "definition",
  define: "definition",

  terminology: "terminology",
  term: "terminology",

  short_answer: "short_answer",
  shortanswer: "short_answer",

  fill_blanks: "fill_blanks",
  fill_in_the_blank: "fill_blanks",
  fill_blank: "fill_blanks",

  comparison: "comparison",
  compare: "comparison",

  scientific_term: "scientific_term",
  scientificterm: "scientific_term",
};
```

### Do not reject the full result

If one question is malformed, do not fail the entire assessment.

Instead:

- skip only the unusable question if absolutely necessary
- or keep it with blanks/defaults if it can still be displayed safely

---

## Layer 5: Professional Internal Metadata Model

Every normalized question must carry professional metadata so both rendering and export remain stable.

### Recommended internal shape

```ts
interface AssessmentQuestionRecord {
  id: string;
  questionType: AssessmentQuestionType;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  displayOrder: number;

  prompt: string;
  answer?: string;
  rationale?: string;

  difficulty?: "easy" | "medium" | "hard";
  points?: number;

  options?: string[];
  correctOptionIndex?: number;

  trueFalseAnswer?: boolean;

  term?: string;
  definition?: string;

  comparisonLeft?: string;
  comparisonRight?: string;
  comparisonAnswer?: string;

  blankTemplate?: string;
  blankAnswers?: string[];

  answerMode:
    | "choice"
    | "boolean"
    | "text"
    | "term_definition"
    | "comparison"
    | "fill_blanks";

  renderVariant:
    | "mcq_card"
    | "true_false_card"
    | "definition_card"
    | "terminology_card"
    | "short_answer_card"
    | "fill_blanks_card"
    | "comparison_card"
    | "scientific_term_card";

  exportVariant:
    | "mcq_export"
    | "true_false_export"
    | "definition_export"
    | "terminology_export"
    | "short_answer_export"
    | "fill_blanks_export"
    | "comparison_export"
    | "scientific_term_export";

  tags?: string[];
  rawSourceIndex?: number;
}
```

### Why this matters

This metadata allows:

- grouped section display
- clean card rendering per type
- future export formatting
- deterministic ordering
- safer pagination
- future extensibility

---

## Layer 6: Filtering Strategy

### Required behavior

The system must never show unselected types in the final grouped output.

### Important rule

If the user selected:

- MCQ
- Short Answer
- Scientific Term

and the model also returns:

- Comparison
- Fill Blanks

then the final display/export should:

- show MCQ
- show Short Answer
- show Scientific Term
- ignore Comparison
- ignore Fill Blanks

### Important note

This is **filtering**, not failure.

Do not reject the result because the model returned extra types.

---

## Layer 7: Grouping Strategy

### Required behavior

The rendered result must group questions by type.

### Example grouped layout

```text
A) MCQ
- all MCQ questions here

B) True / False
- all true/false questions here

C) Scientific Term
- all scientific term questions here

D) Short Answer
- all short answer questions here
```

### Grouping rules

- Only create a section if that type actually has at least one normalized selected question.
- Section ordering must be deterministic.
- Section ordering should follow either:
  - user selection order
  - or a predefined canonical order
- User selection order is preferred if that is the product decision.

### Example section order logic

If the user selected:

1. MCQ
2. Short Answer
3. Scientific Term

then render in exactly that order.

---

## Layer 8: Type-Specific Rendering Ownership

## Important architecture rule

Each question type should have its own render system.

Do not keep one giant renderer full of nested conditionals if future growth is expected.

### Preferred structure

```ts
/components/assessment/renderers/
  render-mcq.tsx
  render-true-false.tsx
  render-definition.tsx
  render-terminology.tsx
  render-short-answer.tsx
  render-fill-blanks.tsx
  render-comparison.tsx
  render-scientific-term.tsx
```

### Shared wrapper layer

```ts
/components/assessment/
  question-section.tsx
  question-renderer-switch.tsx
  assessment-grouped-view.tsx
```

### Recommended behavior

- Each type renderer owns only its type.
- Shared layout shells should remain small and generic.
- Future updates to one type must not force changes to all others.

---

## Layer 9: Card Design Rules by Type

Each type should have a distinct visual card pattern.

### MCQ

Should show:

- question prompt
- option list
- selected correct answer highlight
- answer block
- rationale block if available

### True / False

Should show:

- question prompt
- true/false badge or answer state
- answer block
- rationale if available

### Definition

Should show:

- term or prompt
- definition answer area
- optional explanation

### Terminology

Should show:

- definition or concept prompt
- expected term answer
- compact answer styling

### Short Answer

Should show:

- prompt
- organized answer block beneath
- optional rationale

### Fill Blanks

Should show:

- sentence/template with visible blanks
- answer line or answer chips
- no broken text overflow

### Comparison

Should show:

- left concept
- right concept
- comparison answer or structured differences

### Scientific Term

Should show:

- concept description
- scientific term answer
- compact academic styling

---

## Layer 10: Missing Data Strategy

## This is critical

No single bad field should break the entire page, preview, or export.

### Required fallback behavior

If a field is missing:

- missing prompt -> render empty string or placeholder
- missing answer -> render blank answer block
- missing options in MCQ -> render available ones only
- missing rationale -> omit rationale block
- missing tags -> omit tags block
- missing section title -> use generated fallback like `Question Type`
- missing page metadata -> use safe defaults

### Example fallback helpers

```ts
function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
```

### Product rule

Prefer a visually incomplete but stable result over a crashed flow.

---

## Layer 11: Preview Safety

The preview page must:

- remain inside container bounds
- never overflow outside the page shell
- never overlap the footer
- never let content break the layout
- support grouped sections cleanly

### Preview rules

- section wrappers must have spacing discipline
- cards must use overflow-safe containers
- long text must wrap safely
- dynamic content must never escape card bounds
- footer must remain visually independent

---

## Layer 12: Export Safety

The export layer must preserve:

- grouped section structure
- type-specific styling
- print-safe bounds
- footer safety
- page-breaking safety

### Required export rules

- no content may overlap the footer
- page breaks must happen between safe blocks where possible
- cards should avoid being cut awkwardly
- section headers should stay attached to at least the first question if possible
- the export layer must remain stable even if some fields are blank

### Important export behavior

Export must use the normalized typed result, not raw model output.

---

## Layer 13: Recommended Persistence Model

Store both:

1. raw model output
2. normalized structured output

### Why

Raw output helps debugging.

Normalized output powers:

- preview
- export
- future editing
- versioned rendering
- analytics

### Recommended record shape

```ts
interface AssessmentResultRecord {
  id: string;
  ownerUid: string;
  sourceDocumentId: string;

  selectedQuestionTypes: AssessmentQuestionType[];
  requestedDistribution: Partial<Record<AssessmentQuestionType, number>>;

  rawModelResult: unknown;
  normalizedQuestions: AssessmentQuestionRecord[];

  renderModelVersion: string;
  normalizationVersion: string;

  createdAt: string;
  updatedAt: string;
}
```

---

## Layer 14: Failure-Tolerant Processing Rules

### Required philosophy

The system must be tolerant, not brittle.

### Do this

- ignore unwanted question types in final render
- keep selected valid questions
- fill blanks for missing data
- skip only truly unrecoverable items
- never let one malformed question kill the entire assessment flow

### Do not do this

- do not reject the whole result because of one invalid question
- do not throw because one field is missing
- do not fail because the model returned extra types
- do not tightly couple preview and export to raw model shape

---

## Layer 15: Suggested Implementation Order for Any Agent

### Step 1

Audit current UI selection payload and confirm the selected types and distributions are sent to the backend.

### Step 2

Audit prompt orchestration and ensure selected types + distribution are explicitly injected into the model prompt.

### Step 3

Create or harden a normalization layer that:

- canonicalizes type names
- filters final output by selected types
- fills defaults
- produces typed metadata

### Step 4

Introduce or harden the persistent normalized result structure.

### Step 5

Create dedicated type renderers for each question type.

### Step 6

Create grouped section rendering using:

- selection order
- or canonical order

### Step 7

Wire preview to normalized grouped data only.

### Step 8

Wire export to normalized grouped data only.

### Step 9

Add print-safe and footer-safe layout constraints.

### Step 10

Add regression guards:

- extra type ignored
- missing answer does not crash
- missing rationale does not crash
- missing tags do not crash
- incomplete question still renders safely

---

## Layer 16: Acceptance Criteria

The system is considered correct only if all of the following are true.

### Request layer

- selected question types are truly sent to the backend
- distribution is truly sent to the backend
- settings are truly sent to the backend

### Prompt layer

- the prompt explicitly tells the model what types are allowed
- the prompt requests typed structured output

### Normalization layer

- extra model types do not break the flow
- unwanted types are ignored in final grouped display/export
- missing fields do not crash the flow

### Rendering layer

- questions are grouped by type
- each type has a professional dedicated card style
- grouped sections are ordered correctly
- no overflow beyond page bounds
- no footer overlap

### Export layer

- grouped sections remain preserved
- rendering is print-safe
- page breaks are controlled
- no content exceeds layout boundaries

### Maintainability

- each question type has separated ownership
- future edits to one type do not destabilize others

---

## Layer 17: Non-Negotiable Product Rules

1. The user selection is authoritative.
2. Extra returned question types must be ignored, not allowed into final display/export.
3. No single malformed field may break the entire flow.
4. Blank placeholders are better than a broken assessment page.
5. Normalized structured output is the source of truth for preview and export.
6. Each question type should be independently maintainable.
7. The final result must remain visually professional and export-safe.

---

## Final Summary

This system must behave like a tolerant, type-aware pipeline.

It must not trust raw model output blindly.

It must not fail because of extra or incomplete data.

It must:

- accept the user’s selected types and settings
- pass them to the model
- normalize the returned result
- keep only selected types for final grouped display/export
- render each type in its own professional card system
- preserve layout safety across preview and export
- remain maintainable for future updates

The correct implementation philosophy is:

**strict on user intent, tolerant on model output, stable in rendering, safe in export, modular in ownership**
