# Zootopia Club Next — Interactive Exam Layer Implementation Guide (2026)

## Scope of This Guide

This guide starts from **Layer 2: the interactive exam layer** because the platform already has the **AI model result system** that generates and stores assessment content.

That means the existing platform already gives you the **content truth**:

- questions
- choices
- correct answer
- explanation
- question type
- language
- difficulty
- result ownership

This guide explains how to build the **interactive exam system on top of that result**, without breaking the current architecture.

---

# Core Product Goal

Turn the generated AI result into a real exam experience:

- the user sees the question and choices
- the user does **not** see the correct answer during the exam
- the user selects answers like a real test
- after submission, the user sees:
  - correct / incorrect
  - the correct answer
  - the explanation from the AI result
- every attempt, answer, and result remains **owner-scoped**

---

# The Three Truth Layers

This architecture works best when you keep the following three truths separate.

## 1. AI Generation = Content Truth

This is the original generated result.

It already contains the full source of truth for each question:

- question text
- choices
- correct answer
- correct choice index
- explanation
- metadata

This layer should remain the authoritative content source.

## 2. Interactive Attempt = User Action Truth

This is the exam session for one specific user.

It tracks:

- who started the attempt
- which generated result it belongs to
- the attempt status
- the user’s submitted answers
- timing and progress

This layer must **not** become the new content source. It only describes what the user did.

## 3. Server Evaluation = Scoring Truth

This is the scoring decision made on the backend.

The server compares:

- owner-scoped generated result
- owner-scoped attempt
- submitted answers

Then it computes:

- correct / incorrect per question
- total score
- percentage
- feedback payload

The client must never be the authority for grading.

---

# The Most Important Security Rule

## Never send the answer key to the frontend during the exam.

During the exam page, the browser should receive only:

- question id
- question text
- choices
- maybe difficulty / type if needed

It should **not** receive:

- correct answer
- correct choice index
- explanation
- hidden grading fields

If the frontend receives the answer key, the user can read it in DevTools even if you hide it visually.

So the safe rule is:

- **exam screen:** safe question view only
- **submit endpoint:** server grades using stored source truth
- **review screen:** show answer + explanation only after grading

---

# Recommended Domain Names

Since you are starting from the assessment tool, keep names assessment-specific for now.

Use explicit names like:

- `assessment_interactive_attempts`
- `assessment_interactive_attempt_answers`
- `assessment_interactive_attempt_results`

This is better than prematurely renaming everything to generic wallet-like or tool-wide names.

Later, if you build the same feature for other tools, you can introduce a shared abstraction. For now, honesty in naming is better.

---

# Proposed Data Model

## Table 1 — `assessment_interactive_attempts`

One row per exam attempt.

Suggested columns:

- `id`
- `owner_uid`
- `generation_id`
- `status`
- `mode`
- `started_at`
- `submitted_at`
- `last_activity_at`
- `duration_seconds`
- `total_questions`
- `correct_count`
- `wrong_count`
- `unanswered_count`
- `percentage`
- `score`
- `created_at`
- `updated_at`

### Suggested meanings

- `status`: `in_progress | submitted | abandoned`
- `mode`: `exam | practice`
- `generation_id`: points to the already stored AI result
- `owner_uid`: must always match the authenticated user

---

## Table 2 — `assessment_interactive_attempt_answers`

One row per question answer per attempt.

Suggested columns:

- `id`
- `attempt_id`
- `owner_uid`
- `question_id`
- `selected_choice_index`
- `selected_answer_text_snapshot`
- `is_correct`
- `submitted_at`
- `created_at`
- `updated_at`

### Why store snapshots?

If the original result structure ever changes later, snapshots help preserve the historic user attempt.

You may also store:

- `correct_choice_index_snapshot`
- `correct_answer_text_snapshot`
- `explanation_snapshot`

These can be populated at submission time.

---

## Optional Table 3 — `assessment_interactive_attempt_question_state`

Only needed if you want richer exam UX.

Suggested columns:

- `attempt_id`
- `owner_uid`
- `question_id`
- `is_flagged_for_review`
- `visited_at`
- `last_viewed_at`

This is optional. For MVP you can skip it.

---

# Owner-Scoped Rules

Everything in this system must remain owner-scoped.

## The rules

### Generated result
Must only be loaded by owner-scoped helper functions.

### Attempt
Must belong to:

- authenticated user
- matching generation owner

### Attempt answers
Must only be readable/writable if:

- authenticated user owns the attempt
- authenticated user owns the generation

### Review page
Must only show submitted results for the attempt owner.

### Admin exception
If you have admin review logic later, keep it explicit and server-authorized. Do not mix that into normal owner routes.

---

# API Flow

## 1. Start Attempt

### Route example
`POST /api/assessment/results/[id]/interactive-attempts`

### What it does
- authenticate user
- verify the result belongs to the user
- create a new attempt row
- build a safe exam payload
- return the safe exam payload

### Response example

```json
{
  "attemptId": "attempt_123",
  "generationId": "gen_456",
  "mode": "exam",
  "status": "in_progress",
  "questions": [
    {
      "id": "q_001",
      "type": "mcq",
      "question": "What is the oxidation state of sulfur in H2SO4?",
      "choices": ["+4", "+6", "+2", "0"]
    }
  ]
}
```

Notice again:

- no correct answer
- no explanation
- no grading data

---

## 2. Load Existing In-Progress Attempt

### Route example
`GET /api/assessment/interactive-attempts/[attemptId]`

### What it does
- authenticate user
- verify owner
- return safe attempt payload
- optionally include already saved selections

---

## 3. Save Draft Answers

### Route example
`PATCH /api/assessment/interactive-attempts/[attemptId]/answers`

### What it does
- authenticate user
- verify owner
- update saved answers without grading yet
- update `last_activity_at`

This is useful for autosave.

---

## 4. Submit Attempt

### Route example
`POST /api/assessment/interactive-attempts/[attemptId]/submit`

### What it does
- authenticate user
- verify owner
- load the original generated result
- compare selected answers against stored correct choices
- compute final result
- store score fields
- mark attempt as submitted
- optionally store snapshots into answer rows
- return review payload

### Response example

```json
{
  "attemptId": "attempt_123",
  "status": "submitted",
  "score": 7,
  "total": 10,
  "percentage": 70,
  "results": [
    {
      "questionId": "q_001",
      "isCorrect": false,
      "userChoiceIndex": 0,
      "correctChoiceIndex": 1,
      "userAnswer": "+4",
      "correctAnswer": "+6",
      "explanation": "In H2SO4, hydrogen is +1 and oxygen is -2, so sulfur must be +6."
    }
  ]
}
```

---

## 5. Review Attempt

### Route example
`GET /api/assessment/interactive-attempts/[attemptId]/review`

### What it does
- authenticate user
- verify owner
- only allow if the attempt is submitted
- return review payload

---

# UI / Route Structure

## Existing result page
Keep your current result viewer.

Add two actions:

- **Review generated result**
- **Start interactive exam**

## Recommended pages

- `/assessment/results/[id]`
- `/assessment/results/[id]/exam`
- `/assessment/results/[id]/attempts/[attemptId]`
- `/assessment/results/[id]/attempts/[attemptId]/review`

You can also simplify this if you want fewer routes.

---

# Recommended UX

## A. Exam entry card

Before starting the attempt, show:

- number of questions
- mode
- estimated duration
- language
- question types
- button: **Start interactive exam**

---

## B. During the exam

Good UI features:

- question card
- multiple-choice option buttons
- next / previous navigation
- progress bar
- question navigator panel
- unanswered count
- mark for review
- save state automatically
- submit confirmation modal

---

## C. After submit

Show:

- final score
- percentage
- correct / wrong / unanswered summary
- per-question review
- correct answer
- explanation
- optional retry actions

---

# Practice Mode vs Exam Mode

## Exam Mode
- user answers all questions first
- no answers shown during solving
- grading appears only after submit

## Practice Mode
- user answers a question
- gets immediate correct / incorrect feedback
- sees explanation immediately

Both can use the same stored generation. The difference is only in attempt flow and response timing.

---

# MVP Recommendation

To keep the first version safe and focused, implement only this first:

## MVP scope
- start attempt
- fetch safe questions
- save or submit answers
- server-side grading
- review page with correct answer + explanation
- owner-scoped attempt history

That is enough to make the feature real and valuable.

---

# Recommended Scoring Logic

For MCQ questions, grade using:

- `correctChoiceIndex`

This is more stable than comparing answer text because text can drift due to formatting, spaces, or localization.

If later you support other question types:

- true/false: compare boolean-normalized value
- fill-in-the-blank: compare normalized string or accepted variants
- essay: separate manual/AI secondary evaluation flow

---

# Suggested Server Helpers

You will probably want clean server helpers like:

- `createInteractiveAttemptForOwner(...)`
- `getInteractiveAttemptForOwner(...)`
- `saveInteractiveAttemptAnswersForOwner(...)`
- `submitInteractiveAttemptForOwner(...)`
- `getInteractiveAttemptReviewForOwner(...)`

These should live in your server/repository layer and remain owner-scoped.

---

# Suggested Shared Types

Add explicit types for:

- `InteractiveAttempt`
- `InteractiveAttemptStatus`
- `InteractiveAttemptMode`
- `InteractiveAttemptQuestionSafeView`
- `InteractiveAttemptSubmission`
- `InteractiveAttemptReviewResult`

Keep them explicit and professional.

---

# Suggested Implementation Order

## Phase 1 — Safe attempt foundation
- add migrations
- add shared types
- add repository helpers
- add start-attempt API
- add submit API
- add review API

## Phase 2 — UI integration
- add “Start interactive exam” button
- add exam page
- add review page
- add progress and submit UX

## Phase 3 — history and polish
- attempt history list
- retry exam
- retry only wrong answers
- timing and analytics

---

# Suggested Migration Strategy

Because you already have the generation system, this feature should be added as **new tables**, not by mutating the generation storage shape too aggressively.

That keeps it safer.

So the migration strategy should be:

- keep generated result schema intact
- add attempt tables
- reference generated results by id
- do not copy full question content into attempts at creation time unless you truly need snapshots
- snapshot only at submission time if needed

---

# Example End-to-End Scenario

1. User uploads a file.
2. AI generates 20 questions.
3. The generated result is stored owner-scoped.
4. User opens the result page.
5. User clicks **Start interactive exam**.
6. Server creates attempt `attempt_123`.
7. Server sends safe question payload only.
8. User answers questions.
9. User submits.
10. Server grades against stored source truth.
11. Server stores final result.
12. User sees:
    - score
    - correct / incorrect
    - correct answers
    - explanations
13. User later opens attempt history and sees old attempts, all owner-scoped.

---

# Features You Can Add Later

## Strong next-step features
- timer
- question shuffle
- choice shuffle
- auto-save draft
- abandon/recover in-progress exam
- retry incorrect questions only
- compare attempt 1 vs attempt 2
- weak-topic analytics
- confidence selector before answer
- bookmarks / flag for review
- export attempt review as PDF

## Advanced later features
- spaced repetition
- adaptive re-test
- teacher/admin review mode
- achievement / mastery system
- multi-tool unified testing interface

---

# What Must Stay Server-Authoritative

Never move these decisions to the client:

- whether the result belongs to the user
- whether the attempt belongs to the user
- whether the attempt may be submitted
- the grading result
- the correct answer reveal
- the final score
- access to attempt history

---

# What the Client Is Allowed To Own

The browser can safely own temporary UI state like:

- current question index
- selected option before save
- navigator expansion/collapse
- timer display
- review panel toggles

But not grading truth.

---

# Performance Notes

This feature is usually cheap to run because:

- the expensive AI generation already happened before
- grading MCQ is lightweight
- most logic is database reads/writes plus array comparison

So it is a strong feature with a good performance-to-value ratio.

---

# Recommended Naming Philosophy

Use names that are:

- honest
- tool-specific where appropriate
- future-safe without pretending genericity too early

Good:
- `assessment_interactive_attempts`
- `assessment_interactive_attempt_answers`

Less ideal for this stage:
- `tool_usage_sessions`
- `global_exam_events`

Those are too generic for your current reality unless you already centralize multiple tools.

---

# Final Design Rule

The best architectural sentence for this feature is:

> AI generation is content truth.  
> Interactive attempt is user action truth.  
> Server evaluation is scoring truth.

If you preserve that separation, the feature will stay secure, understandable, and easy to extend.

---

# Recommended Deliverable Scope for First Real Build

If you want the smartest first implementation, build exactly this:

1. start interactive attempt
2. fetch safe exam questions
3. submit answers server-side
4. review graded result
5. save attempt history owner-scoped

That gives you a professional production foundation without overbuilding the first version.

---

# Closing Recommendation

Because your platform already has:

- upload
- AI result generation
- owner-scoped result storage
- result viewer

you are in an excellent place to add this feature now.

You do **not** need to rebuild the generation engine.

You only need to build the **interactive exam layer** on top of the already saved result truth.

That is the correct and safe direction.
