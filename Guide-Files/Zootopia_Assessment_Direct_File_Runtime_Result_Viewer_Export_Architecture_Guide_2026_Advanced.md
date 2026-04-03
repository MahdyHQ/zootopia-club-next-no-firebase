# Zootopia Club Next — Assessment Direct-File Runtime, Preview, Prompt Orchestration, and Export Architecture Guide (2026)

## Purpose

This guide defines a **production-safe implementation plan** for a modern **Assessment direct-file workflow** inside **Zootopia Club Next**.

It expands the earlier plan and now explicitly includes:

- the new **Assessment modes**:
  - **Question Generation**
  - **Exam Generation**
- the newer Assessment settings and selection lists
- a richer **prompt orchestration layer** inspired by the old Zootopia platform
- a stronger **result preview architecture**
- a stronger **exporter architecture** with branded PDF / DOCX / Markdown / image export behavior
- a dedicated **preview page** and a dedicated **stored result viewer page**
- guidance for selectively reusing and adapting strong parts of the old project from:
  - `C:\zootopia_club_ai_platform\src\utils`
  - `C:\zootopia_club_ai_platform\src\ai`

This guide is written for the **real current repo architecture**, where:

- `apps/web` is the live runtime
- `apps/web/app/api/**/route.ts` is the active backend surface
- same-origin App Router Route Handlers are the real server API
- `apps/api` is **not** the live production backend today
- Firebase App Hosting is the primary deployment target

This guide is a **safe evolution plan**, not a clean-slate rebuild.

---

# 1. Short answer

## Yes — this architecture is valid and recommended

Your proposed Assessment flow is correct **if** you treat the uploaded file as a **temporary owner-scoped workspace asset** and delay model-side file handling until the user actually clicks **Generate**.

That means:

1. the user uploads a file
2. the backend stores the original file temporarily in the owner workspace
3. the UI confirms the upload succeeded
4. the user moves to the Assessment page
5. the latest active uploaded file is auto-linked as the default `Linked document`
6. the user chooses:
   - mode
   - settings
   - model
   - optional custom instructions / prompt
7. when the user clicks **Generate**, the backend assembles:
   - linked file
   - selected mode
   - selected settings
   - hidden tool template
   - optional custom instructions
   - selected model
8. the backend sends the final orchestration package to the selected provider
9. the normalized result is stored for **3 days**
10. the UI reveals a button to open a dedicated **Preview page**
11. from preview, the user can open the dedicated **stored result viewer page** and export in multiple formats

---

# 2. Updated product decision

## Recommended primary path for Assessment

### Upload now, model-ingest later at generation time

For Assessment, do **not** run Datalab Convert immediately after upload.

Instead:
- upload and store the original file only
- mark it as the current active workspace document
- let Assessment generation be the step that performs:
  - file upload to provider if needed
  - file reasoning
  - optional extraction fallback
  - orchestration

This gives you:
- faster upload UX
- cleaner page responsibility
- lower unnecessary preprocessing cost
- better alignment with `upload -> confirm -> go to assessment`
- more control per selected model and mode

---

# 3. Important caveat

## Do not destroy the extraction fallback concept

Even if you remove **Datalab Convert** from the **default Assessment path**, do **not** erase extraction from the long-term architecture.

Why:
- some providers are stronger with raw PDF/file inputs
- some providers are stronger with normalized text context
- some file types may need normalization before safe prompting
- future tools may still benefit from extracted reusable content

## Correct policy

### Phase 1
Assessment primary flow = **direct file to selected model**

### Phase 2
Optional fallback extraction adapter remains available for:
- unsupported file types
- provider fallback
- search/indexing later
- reuse by future tools
- heavy document workflows

So the right move is:
- remove Datalab from the **main Assessment upload path**
- keep the ability to introduce extraction later where justified

---

# 4. Updated user journey

## Step A — Upload page

The user opens `/upload` and uploads a file.

### Upload page responsibilities
- validate file type and size
- upload the original file
- store it temporarily under the current owner workspace
- mark it as the active linked document
- show upload success
- show file name, mime type, size, and confirmation state
- show CTA:
  - **Continue to Assessment**
  - **Open Assessment Studio**

### Important rule
Do **not** auto-start generation on the Upload page.

The Upload page is **upload-only** and must not become the Assessment page.

---

## Step B — Assessment page

When the user reaches `/assessment`:
- load the active workspace document
- prefill `Linked document`
- show the file name by default
- allow prompt-only mode when no file exists
- allow the user to configure the Assessment request

### Assessment must support both:
- **prompt-only generation**
- **file + prompt generation**

### If the user uploads a new file later
The system must:
- invalidate the previous active document
- replace it with the new one
- update the default linked document automatically
- ensure the linked-document UI reflects the new current file

---

## Step C — Generate

When the user clicks **Generate assessment**:
- the backend resolves the linked document
- resolves the selected mode
- resolves the selected model
- resolves all selected Assessment settings
- resolves optional user prompt / custom instructions
- injects the hidden tool template layer
- checks provider/file compatibility
- produces a final orchestration package
- sends the request to the provider
- normalizes the result
- stores the result for **3 days**
- returns a result id and preview route

### Important UX addition
After successful result storage, the UI should reveal a button such as:
- **Open Preview**
- **View Result Preview**

This button should open the dedicated preview surface for this generated result.

---

## Step D — Preview page

Before or alongside the long-term stored result page, add a **dedicated preview page**.

### Recommended preview route

```text
/assessment/preview/[id]
```

This preview page should:
- render the result using a premium shared preview shell
- support dark and light preview modes
- allow switching preview theme with a dedicated toggle
- expose export actions
- expose an action to open the stored result viewer page
- remain owner-scoped and authenticated

### Why add preview as a separate page
Because the preview surface should become a high-quality reusable rendering layer, similar in spirit to your older result preview architecture.

It should not be a cramped in-page modal only.

---

## Step E — Stored result viewer page

### Recommended stored result route

```text
/assessment/results/[id]
```

This page should:
- load the saved result from storage
- validate ownership and expiration
- show premium branded layout
- show metadata
- show linked document info
- show model used
- show generation timestamp
- show mode used
- show export actions
- support reopening and history later

---

# 5. New architecture layers

Implement the Assessment feature using these layers.

## Layer 1 — Temporary upload workspace
Stores the uploaded original file only.

## Layer 2 — Active linked document resolver
Resolves the latest valid uploaded file per owner workspace.

## Layer 3 — Assessment mode and settings resolver
Normalizes all UI-selected Assessment options into one structured config object.

## Layer 4 — Assessment prompt orchestration layer
Combines:
- baseline system rules
- tool template rules
- selected mode rules
- selected settings
- optional user custom instructions
- file context / file reference
- additional context
- model capability hints

## Layer 5 — Provider execution layer
Routes execution to the chosen model/provider and packaging strategy.

## Layer 6 — Result persistence layer
Stores normalized results for 3 days.

## Layer 7 — Preview layer
Renders the generated result in a detached, export-ready preview surface.

## Layer 8 — Result viewer + exporter layer
Loads saved results and handles branded preview/export.

---

# 6. Assessment modes

The Assessment feature now needs explicit support for **two high-level modes**.

## 6.1 Question Generation mode

Purpose:
- generate standalone educational questions
- can be used for practice, revision, self-check, or focused topic drilling
- may be lighter, shorter, or more flexible than a formal exam

Recommended UI label:
- **Question Generation**

Recommended internal id:
- `questions`

## 6.2 Exam Generation mode

Purpose:
- generate a more formal exam-style output
- should feel more structured, rigorous, and professionally ordered
- should support stronger scoring / sections / exam tone later

Recommended UI label:
- **Exam Generation**

Recommended internal id:
- `exam`

## 6.3 Default mode

Recommended default:
- `questions`

## 6.4 Why mode must affect orchestration

Mode must not be a cosmetic UI label only.

It should affect:
- tone
- rigor
- structure
- ordering
- output schema expectations
- optional use of emojis
- exam-style constraints
- grouping strategy

---

# 7. Updated Assessment settings model

Below is the recommended normalized Assessment settings structure.

```ts
export type AssessmentMode = 'questions' | 'exam';

export type AssessmentGoal =
  | 'practice'
  | 'revision'
  | 'exam'
  | 'self_assessment';

export type AssessmentDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'
  | 'mixed';

export type AssessmentOutputLanguage = 'english' | 'arabic';

export type AssessmentQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'open_ended'
  | 'short_answer'
  | 'matching'
  | 'fill_in_the_blank'
  | 'case_based';

export interface AssessmentSettings {
  mode: AssessmentMode;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  outputLanguage: AssessmentOutputLanguage;
  selectedModelId: string;
  linkedDocumentId?: string;
  includeEmojis?: boolean;
  includeExplanations?: boolean;
  goal?: AssessmentGoal;
  tone?: string;
  questionTypes?: AssessmentQuestionType[];
  typeDistribution?: Partial<Record<AssessmentQuestionType, number>>;
  timeLimitMinutes?: number;
  sectionCount?: number;
  includeAnswerKey?: boolean;
  includeScoringGuide?: boolean;
  customPrompt?: string;
}
```

## 7.1 Minimum required settings for the first production pass

At minimum, support:
- mode
- questionCount
- difficulty
- outputLanguage
- selectedModelId
- linkedDocumentId
- includeEmojis
- includeExplanations
- customPrompt

## 7.2 Optional settings to support now if already in the UI

If your current UI already includes or is about to include more lists, support them properly in orchestration rather than leaving them decorative.

Recommended examples:
- goal
- question types list
- tone/style
- answer key toggle
- scoring guide toggle
- section count for exam mode
- time limit for exam mode

---

# 8. Storage strategy

## 8.1 Separate upload workspace from result storage

You need **two storage domains**.

### A. Temporary file workspace
For uploaded source files only.

### B. Result storage
For generated Assessment results only.

Do not collapse these into one domain.

---

## 8.2 Temporary upload workspace design

Recommended conceptual path:

```text
runtime/workspaces/{role}/{ownerId}/active-document/
```

More explicit:

```text
runtime/workspaces/users/{userId}/documents/{documentId}/original/
runtime/workspaces/admins/{adminId}/documents/{documentId}/original/
```

Store:
- original file path
- original file name
- mime type
- size
- uploadedAt
- documentId
- owner id
- owner role
- status
- replaced/deleted markers
- optional checksum

---

## 8.3 Result storage design

Recommended record shape:

```ts
interface AssessmentGenerationRecord {
  id: string;
  ownerUid: string;
  ownerRole: 'user' | 'admin';
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  modelId: string;
  provider: 'google' | 'qwen';
  mode: 'questions' | 'exam';
  promptText?: string;
  userInstructions?: string;
  settings: AssessmentSettings;
  orchestrationVersion: string;
  schemaVersion: string;
  previewRoute: string;
  resultRoute: string;
  previewThemeMode?: 'light' | 'dark';
  resultJson: unknown;
  resultMarkdown?: string;
  status: 'ready' | 'failed';
  createdAt: string;
  expiresAt: string;
}
```

Retention:
- **3 days**

---

# 9. Session and workspace isolation

## Required rule
Each user/admin must have isolated temporary upload state and isolated generated results.

## Never allow
- global active document
- shared anonymous temporary file slot
- one owner’s linked document to leak into another’s Assessment page
- one owner’s preview page or result page to load another owner’s result

## Required replacement behavior
When a new file is uploaded and intended to replace the previous one:
- invalidate the previous active document
- delete or mark the old temp file for cleanup
- update the active linked document reference
- update the linked-document dropdown or default selection accordingly

---

# 10. Updated upload flow

## Upload page responsibilities
The Upload page should do only these things:
- validate file type and size
- send the file to backend
- store file in temporary owner workspace
- mark file as active current document
- show success state
- show “Continue to Assessment” CTA

## Recommended response contract

```ts
interface UploadSuccessResponse {
  ok: true;
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isActiveDocument: true;
  nextRoute: '/assessment';
}
```

## Important upload states
Show:
- idle
- uploading
- uploaded successfully
- replace existing file confirmation if needed
- failed upload

---

# 11. Expanded Assessment orchestration design

The Assessment generation request should use a richer orchestration layer inspired by your older platform.

## 11.1 Core orchestration principles

The orchestration layer must:
- enforce tool settings strictly
- preserve current tool and page boundaries
- allow model-specific adaptation without changing the UI contract
- support hidden instructions safely
- support additional file-derived context later
- stay compatible with export and preview fidelity requirements

## 11.2 Recommended orchestration layers

### Baseline system layer
General Zootopia Club educational system instructions.

### Tool template layer
Assessment-specific hidden instructions.

### Mode layer
Mode-specific instructions for:
- `questions`
- `exam`

### Settings layer
Structured tool settings chosen by the user.

### User custom instructions layer
Optional free-text instructions from the user.

### Document layer
Linked file input or file-derived context.

### Additional shared context layer
Optional summary / OCR / extracted markdown / structured document / warnings.

### Render fidelity layer
Formatting instructions that help previews and exports stay clean.

---

# 12. Recommended PromptOrchestrator evolution

The old project’s `PromptOrchestrator` is a strong reference model and should be selectively adapted into the new architecture.

## 12.1 Features worth carrying forward

Keep or adapt these ideas:
- baseline instructions
- strict adherence to tool settings
- model compatibility checking
- fallback model policy
- per-tool templates
- render/export fidelity instructions
- optional file context injection
- optional additional context injection
- mode-aware tool instructions
- structured response schema generation

## 12.2 Updated ToolConfig recommendation for Assessment

```ts
export interface AssessmentToolConfig {
  toolId: 'assessment';
  userPreferences?: string;
  settings?: AssessmentSettings;
  linkedDocument?: {
    documentId: string;
    fileName: string;
    mimeType: string;
    providerInputMode?: 'direct_file' | 'text_context' | 'hybrid';
  };
  fileContext?: string;
  fileName?: string;
  additionalContext?: {
    summary?: string;
    ocr?: string;
    metadata?: Record<string, unknown>;
    insights?: string;
    extractedText?: string;
    extractedMarkdown?: string;
    structuredDocument?: string;
    pageMap?: string;
    headingTree?: string;
    warnings?: string;
  };
  promptTemplateGroup?: 'assessment_questions' | 'assessment_exam';
}
```

## 12.3 Recommended baseline instructions

Adapt the earlier baseline idea into Assessment like this:

- always follow all tool settings strictly
- if a question count is specified, generate exactly that count
- if a language is selected, respond in that language
- if a difficulty is selected, calibrate accordingly
- do not ignore user-selected values
- do not drift from the requested mode

## 12.4 Recommended render fidelity instructions

Keep export/preview-friendly instructions such as:
- prefer shallow headings
- use clean Markdown
- use concise sections
- avoid unnecessary HTML
- use emojis only where allowed and useful
- keep Arabic output RTL-friendly

---

# 13. Assessment-specific hidden templates

The Assessment feature should now use **two separate hidden template groups**.

## 13.1 Questions mode template

Purpose:
- generate standalone questions
- allow flexible study-oriented format
- can use tasteful emojis if enabled
- emphasize learning utility and clarity

Recommended hidden template intent:
- generate professional educational questions
- preserve academic clarity
- follow requested question count exactly
- use only requested question types
- include detailed explanations when enabled
- use emojis only when the selected settings allow it
- structure output as normalized JSON

## 13.2 Exam mode template

Purpose:
- generate a more formal exam sheet
- stronger ordering and rigor
- more professional tone
- can support sectioning and score distribution later

Recommended hidden template intent:
- generate a structured exam-style assessment
- order items clearly from easier to more rigorous if required by settings
- preserve academic exam tone
- avoid playful style unless explicitly requested
- include answer key and scoring guide when enabled
- structure output as normalized JSON suitable for preview and export

---

# 14. Response schema design

The Assessment tool should return structured JSON, not free-form prose only.

## 14.1 Question Generation schema

```ts
interface AssessmentQuestionItem {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  topic: string;
  emoji?: string;
}
```

## 14.2 Exam Generation schema

```ts
interface AssessmentExamSection {
  id: string;
  title: string;
  instructions?: string;
  points?: number;
  questions: AssessmentQuestionItem[];
}

interface AssessmentExamResult {
  examTitle: string;
  examSubtitle?: string;
  totalQuestions: number;
  estimatedDurationMinutes?: number;
  sections: AssessmentExamSection[];
  answerKey?: AssessmentQuestionItem[];
  scoringGuide?: string;
}
```

## 14.3 Schema versioning

Version the result schema from day one.

Recommended fields:
- `schemaVersion`
- `orchestrationVersion`
- `mode`

This prevents future prompt upgrades from breaking older results.

---

# 15. Direct-file model processing strategy

## 15.1 Backend-only file handling

Never process the file in the browser for model input.

The backend decides how to package the file based on:
- selected model
- provider
- file type
- mode
- current capability policy

## 15.2 Provider-specific policy

### Gemini flows
Use server-side file upload / file prompting where appropriate.

### Qwen flows
Use server-side provider-compatible direct file/document path only when the selected Qwen runtime truly supports the file type and modality.

## 15.3 Capability guardrail

Do not assume all providers handle all document types equally well.

Use a capability policy such as:

```ts
type AssessmentInputMode =
  | 'prompt-only'
  | 'text-context'
  | 'pdf-file'
  | 'image-document'
  | 'hybrid';
```

---

# 16. File type policy

## Phase 1 safe list
- PDF
- PNG
- JPG / JPEG
- TXT

## Phase 2 optional support
- DOCX
- PPTX
- XLSX

Why phase office docs later:
- PDFs and images are usually more predictable in direct model prompting
- office files often benefit from extraction or normalization first

---

# 17. New preview page and result page routes

## Recommended routes

```text
/upload
/assessment
/assessment/preview/[id]
/assessment/results/[id]
/api/uploads
/api/assessment
/api/assessment/linked-document
/api/assessment/results/[id]
/api/assessment/export/pdf/[id]
/api/assessment/export/docx/[id]
/api/assessment/export/markdown/[id]
/api/assessment/export/json/[id]
```

## Optional print route

```text
/assessment/results/[id]/print
```

This print route is highly useful for premium PDF generation.

---

# 18. Preview page architecture

Your old preview system has several strong ideas that should be adapted.

## 18.1 Features worth bringing into Assessment preview

The dedicated preview surface should support:
- detached page rendering
- preview mode theme toggle (`light` / `dark`)
- export toolbar
- metadata side panel
- premium summary block
- shared preview shell
- branded header
- QR code / verification treatment if desired
- separate preview state persistence per tool/type

## 18.2 Suggested new components in the current repo

- `apps/web/app/(protected)/(completed)/assessment/preview/[id]/page.tsx`
- `apps/web/components/assessment/assessment-preview-shell.tsx`
- `apps/web/components/assessment/assessment-preview-content.tsx`
- `apps/web/components/assessment/assessment-preview-theme-toggle.tsx`
- `apps/web/components/assessment/assessment-export-actions.tsx`

## 18.3 Theme toggle recommendation

Use a compact preview theme mode toggle inspired by your old `PreviewThemeModeToggle` component.

It should:
- switch only preview/export theme
- not necessarily change global app theme
- persist preview mode by tool or preview type

---

# 19. Result viewer content blocks

## Header
- platform logo
- result title
- created date/time
- mode used
- model used
- linked file name
- language/difficulty metadata

## Summary strip
- question count
- difficulty
- generation status
- source linked or prompt-only
- mode label

## Main content
For `questions` mode:
- ordered questions
- options
- correct answers
- explanations

For `exam` mode:
- exam title
- sections
- section instructions
- points if present
- grouped questions
- optional answer key
- optional scoring guide

## Export actions
- export PDF
- export DOCX
- export Markdown
- export JSON
- export PNG snapshot where useful
- copy text
- print

## Footer
- branding
- retention info
- generated-by metadata

---

# 20. Export architecture — updated recommendation

The earlier recommendation still stands, but now the exporter should include more of the old project’s premium behavior.

## Final export recommendation

Use **three layers**, not just one.

### Layer A — Page/Preview rendering layer
- Next.js page/components
- theme-aware preview shell
- consistent metadata rendering

### Layer B — HTML snapshot export lane
- high-fidelity themed exports
- useful for PDF and image snapshots

### Layer C — structured document export lane
- DOCX / Markdown / JSON exports
- schema-aware formatting

---

# 21. Exporter features to carry forward from the old project

Adapt the following ideas from the old exporter system.

## 21.1 Theme-aware export mode

Exports should respect a dedicated **preview/export theme mode**.

Recommended type:

```ts
export type ExportThemeMode = 'light' | 'dark';
```

## 21.2 Export metadata support

Allow export metadata such as:
- model
- mode
- language
- difficulty
- file name
- created date
- owner context if safe

Recommended shape:

```ts
export interface ExportMetadataItem {
  label: string;
  value: string;
}
```

## 21.3 Summary block support

Allow an optional export summary block at the top of preview/PDF/DOCX/Markdown.

## 21.4 Branding layer

Support:
- platform name
- platform tagline
- optional QR code
- verification seal treatment
- WhatsApp/footer branding if product-approved

## 21.5 Background system

Support theme-aware background assets or themed CSS backgrounds for:
- preview
- PDF snapshot route
- export shell

## 21.6 Snapshot export support

Support DOM snapshot export for:
- PDF snapshot
- PNG / JPG / WEBP snapshot

## 21.7 Structured export support

Support:
- DOCX
- Markdown
- JSON
- optionally plain text later

## 21.8 Fallback support

It is acceptable to keep a fallback export path, but do not make the fallback the premium primary path.

---

# 22. Best current export stack for this project

## Primary premium PDF route

### Recommended
- **Playwright PDF** from a dedicated print/preview route

Best for:
- premium, branded, print-accurate reports
- server-side export in production
- consistent CSS and layout fidelity

## Secondary high-fidelity snapshot path

### Recommended
- **html2canvas** for client-side snapshot exports when needed

Best for:
- preview-to-image download
- snapshot PDF fallback
- quick user-side convenience flows

## DOCX export

### Recommended
- **docx**

Best for:
- structured Word exports
- exam sheets and question sets

## Low-level PDF post-processing

### Recommended
- **pdf-lib**

Best for:
- merging cover pages
- metadata stamping
- advanced PDF editing after generation

## Lightweight client PDF fallback

### Optional only
- **jsPDF**

Useful for:
- fallback utilities
- simple cases

Not recommended as the premium final lane.

## Markdown export

### Recommended
- Blob-based export from structured markdown strings

## Image snapshot export

### Recommended
- `html2canvas` + blob download

## Charting

### Recommended default
- **Recharts**

### Recommended advanced option
- **Apache ECharts**

---

# 23. Exporter behavior by format

## PDF

Should support:
- premium preview-theme-aware layout
- summary block
- metadata cards
- header branding
- footer branding
- question/exam structure
- optional charts later

## DOCX

Should support:
- branded heading
- title
- metadata line
- question/exam structure
- answer/explanation structure

## Markdown

Should support:
- branded title header
- metadata list
- question/exam structure
- answer/explanation blocks

## JSON

Should support:
- normalized stored schema
- safe export for integrations/debugging

## PNG / JPG / WEBP

Should support:
- snapshot export from preview shell where it makes sense

---

# 24. Assessment result preview model

A normalized preview model should exist so:
- preview page
- result page
- export layer
- detached preview patterns

all use the same source of truth.

Recommended concept:

```ts
export type AssessmentPreviewType = 'questions' | 'exam' | 'text';

export interface NormalizedAssessmentPreview {
  title: string;
  type: AssessmentPreviewType;
  summary: string;
  metadata: ExportMetadataItem[];
  plainTextExport: string;
  markdownExport: string | null;
  mode: 'questions' | 'exam';
  hasStructuredContent: boolean;
  rawResult: unknown;
}
```

---

# 25. File ownership and recommended repo paths

Because the live runtime is `apps/web`, keep implementation in the current live structure.

## Frontend
- `apps/web/app/(protected)/(completed)/upload/page.tsx`
- `apps/web/components/upload/upload-workspace.tsx`
- `apps/web/app/(protected)/(completed)/assessment/page.tsx`
- `apps/web/components/assessment/assessment-studio.tsx`
- `apps/web/app/(protected)/(completed)/assessment/preview/[id]/page.tsx` (new)
- `apps/web/app/(protected)/(completed)/assessment/results/[id]/page.tsx` (new)
- `apps/web/components/assessment/assessment-preview-shell.tsx` (new)
- `apps/web/components/assessment/assessment-result-viewer.tsx` (new)
- `apps/web/components/assessment/assessment-export-actions.tsx` (new)
- `apps/web/components/assessment/assessment-preview-theme-toggle.tsx` (new)

## Backend routes
- `apps/web/app/api/uploads/route.ts`
- `apps/web/app/api/assessment/route.ts`
- `apps/web/app/api/assessment/linked-document/route.ts` (new)
- `apps/web/app/api/assessment/results/[id]/route.ts` (new)
- `apps/web/app/api/assessment/export/pdf/[id]/route.ts` (new)
- `apps/web/app/api/assessment/export/docx/[id]/route.ts` (new)
- `apps/web/app/api/assessment/export/markdown/[id]/route.ts` (new)
- `apps/web/app/api/assessment/export/json/[id]/route.ts` (new)

## Server modules
- `apps/web/lib/server/document-runtime.ts`
- `apps/web/lib/server/repository.ts`
- `apps/web/lib/server/ai/prompt-orchestrator.ts`
- `apps/web/lib/server/ai/execution.ts`
- `apps/web/lib/server/ai/provider-runtime.ts`

## New recommended server modules
- `apps/web/lib/server/assessment-linked-document.ts`
- `apps/web/lib/server/assessment-orchestrator.ts`
- `apps/web/lib/server/assessment-result-storage.ts`
- `apps/web/lib/server/assessment-preview.ts`
- `apps/web/lib/server/assessment-exporter.ts`
- `apps/web/lib/server/assessment-print-renderer.ts`
- `apps/web/lib/server/assessment-retention.ts`

---

# 26. Result retention and cleanup

## Required rule
Assessment results remain available for **3 days** only.

## Recommended fields
- `createdAt`
- `expiresAt`
- `status`

## Cleanup strategy

### Option A — lazy cleanup on access
If a result is requested and expired:
- mark deleted or expired
- deny load

### Option B — scheduled cleanup
Delete expired records and related artifacts on a schedule.

### Best practice
Use both:
- lazy cleanup for correctness
- scheduled cleanup for storage hygiene

---

# 27. Linked document resolver

## On Assessment page load
Ask the backend for the current active linked document for the owner workspace.

Recommended response:

```ts
interface LinkedAssessmentDocumentResponse {
  ok: true;
  activeDocument: {
    documentId: string;
    fileName: string;
    mimeType: string;
    uploadedAt: string;
  } | null;
}
```

## UI behavior
- if active document exists -> preselect it
- if none -> show `No linked document`
- if user uploads a new one later -> replace the current linked default

---

# 28. Data safety and validation

## Validate on upload
- max file size
- allowed mime types
- owner session
- replacement policy

## Validate on generation
- selected model allowed for assessment
- mode allowed
- linked document belongs to current owner
- file still exists and is active
- file type supported by selected model
- settings valid
- output schema valid

## Validate on preview/result load
- result belongs to current owner
- result not expired
- role and session valid

---

# 29. Model capability and provider routing

Recommended capability policy:

```ts
interface AssessmentModelCapability {
  modelId: string;
  provider: 'google' | 'qwen';
  supportsPromptOnly: boolean;
  supportsPdfFile: boolean;
  supportsImageDocument: boolean;
  supportsOfficeDocsDirectly: boolean;
  supportsQuestionsMode: boolean;
  supportsExamMode: boolean;
}
```

This lets you decide safely:
- whether linked document can be sent directly
- whether fallback text extraction is needed
- whether the selected mode is supported
- whether unsupported combinations should be blocked clearly

---

# 30. Why this architecture is better than immediate Datalab on upload

## Benefits
- simpler upload UX
- lower unnecessary preprocessing
- more direct alignment with user intent
- less waste when user uploads but never generates
- stronger per-model orchestration control
- cleaner page separation
- cleaner preview/export lifecycle

## Tradeoffs
- generation request is heavier
- provider capability differences matter more
- file-type policy must be stricter
- some office docs may still need fallback normalization later

---

# 31. Additional features you should include

## 31.1 Active document replacement confirmation
Show a clear confirmation when replacing an existing active file.

## 31.2 File badges
Show file type and size in Upload and Assessment.

## 31.3 Generation status timeline
Show states such as:
- preparing file
- building prompt
- contacting provider
- normalizing result
- saving result

## 31.4 Open Preview button after save
After the result is stored successfully, show a clear CTA:
- **Open Preview**

## 31.5 Result history later
Add an Assessment results history page later.

## 31.6 Export audit metadata later
Store export events if admin-grade audit becomes needed.

## 31.7 Print CSS
Create dedicated print CSS for perfect PDF rendering.

## 31.8 Retry-safe generation
Prevent duplicate result creation on repeated clicks.

## 31.9 File deduplication later
Optionally detect identical reuploads by checksum.

## 31.10 Safe error UX
Show clear user-facing errors without leaking provider internals.

---

# 32. Best-practice implementation order

## Phase 0 — Audit current flow
- inspect upload path
- inspect Assessment path
- inspect repository/runtime modules
- inspect current result persistence
- inspect current model selector
- inspect new mode selector and current settings lists

## Phase 1 — Temporary upload ownership
- store original file only
- mark active document
- add replacement logic
- stop Datalab from being the default Assessment upload behavior

## Phase 2 — Linked document loading
- add backend resolver for current active file
- auto-populate linked document on Assessment page

## Phase 3 — Mode-aware settings normalization
- normalize new `questions` / `exam` modes
- normalize all current Assessment lists/settings
- make mode meaningfully affect orchestration

## Phase 4 — Prompt orchestration
- combine baseline + tool template + mode template + settings + optional prompt + file
- validate model/file/mode compatibility
- enforce response schema

## Phase 5 — Generation execution
- send final request to provider/model
- normalize structured result
- store result
- return preview/result route

## Phase 6 — Preview page
- build `/assessment/preview/[id]`
- add premium shared preview shell
- add preview theme toggle
- add preview export actions

## Phase 7 — Stored result page
- build `/assessment/results/[id]`
- add themed result viewer and metadata

## Phase 8 — Exporter layer
- add print route
- add Playwright PDF export
- add html2canvas snapshot export
- add DOCX / Markdown / JSON export
- keep optional fallback paths where justified

## Phase 9 — Retention and cleanup
- add `expiresAt`
- add lazy cleanup and scheduled cleanup

---

# 33. Final recommended technical stack

## Core app/runtime
- Next.js App Router
- same-origin Route Handlers
- current auth/session architecture
- Firebase Admin-backed server authority

## File handling
- existing upload backend path
- temporary owner-scoped storage

## Assessment orchestration
- current prompt orchestrator evolved for Assessment mode + linked files
- per-model capability policy

## Result preview
- dedicated preview page
- shared preview shell
- preview theme mode toggle

## Result storage
- Firestore for metadata/results
- storage for optional exported artifacts if needed

## Charts
- Recharts first
- ECharts when heavier visualization is needed

## PDF/export
- Playwright as the premium primary PDF lane
- html2canvas for snapshot export and convenience flows
- docx for Word export
- pdf-lib for PDF post-processing
- jsPDF only as fallback utility

---

# 34. Required review of old-project sources

Before implementation, the agent should inspect the old project for patterns worth reusing or adapting from:

```text
C:\zootopia_club_ai_platform\src\utils
C:\zootopia_club_ai_platform\src\ai
```

Priority areas to review:
- prompt orchestration logic
- tool templates
- response schema shaping
- result preview normalization
- preview shell patterns
- preview theme toggle patterns
- exporter logic
- branding helpers
- document background helpers
- metadata normalization helpers
- markdown export helpers
- PDF/DOCX/image export helpers

Important rule:
- do not blindly copy old complexity
- selectively adapt what fits the new `apps/web` runtime architecture

---

# 35. Final recommendation

For the current project, the best implementation path is:

1. remove Datalab Convert from the **default Assessment upload path**
2. keep uploaded files as temporary workspace assets
3. auto-link the most recent active file in Assessment
4. support both **Question Generation** and **Exam Generation** modes as first-class orchestration inputs
5. include all meaningful Assessment settings and lists in structured orchestration
6. evolve the prompt orchestrator to include baseline rules, mode templates, settings, optional user instructions, document context, additional shared context, and response schema shaping
7. create a dedicated **Preview page**
8. create a dedicated **stored result page**
9. store results for **3 days**
10. use a premium exporter architecture with theme-aware preview and branded exports
11. keep an optional extraction fallback concept for unsupported file/model combinations

This gives you a stronger, cleaner, and more professional 2026 Assessment architecture without destroying future flexibility.

---

# 36. One-sentence architecture summary

**Upload first, store the original file temporarily per owner workspace, auto-link it in Assessment, let the user choose Questions or Exam mode plus all structured settings, orchestrate file + settings + mode + optional prompt at generation time, save the result for 3 days, then open it through a dedicated preview page and a premium stored result page with rich export capabilities.**
