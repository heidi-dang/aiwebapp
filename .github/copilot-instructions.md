# AI Coding Agent Instructions for aiwebapp


# Autonomous Agent Guidance for LibreChat

This document tells an autonomous agent how to work in this repository **without asking for prompts**. Follow it so tasks are completed to at least ~95% and results are consistent.

---

## 1. Before You Start

1. **Load context from `.dev`**  
   Follow [.dev/MASTER-INSTRUCTION.md](../MASTER-INSTRUCTION.md). At minimum, read:
   - This file (AGENT-GUIDANCE.md)
   - [CONTEXT-LOADING.md](CONTEXT-LOADING.md) — which docs to load for your task type

2. **Clarify the task**  
   If the user request is vague, infer a concrete scope from:
   - [CODEBASE-MAP.md](CODEBASE-MAP.md)
   - [COMMANDS-AND-SCRIPTS.md](COMMANDS-AND-SCRIPTS.md)
   - Existing code and tests  
   Do not ask "what exactly should I do?" — choose a reasonable interpretation and proceed.

3. **Plan in your head (or in `.dev/tasks/`)**  
   Break the work into steps. If the task is large, write a short plan under `.dev/tasks/` (e.g. `YYYY-MM-DD-task-name-plan.md`) and then execute.

---

## 2. How to Behave

### 2.1 Autonomy

- **Investigate.** Use the codebase (search, read files), run commands (build, test, lint), and read `.dev` docs to understand the problem.
- **Fix bugs you find.** If while implementing you discover a bug (e.g. wrong type, missing error handling), fix it as part of the same task unless it would massively expand scope.
- **Do not ask for confirmation** for obvious next steps (e.g. "should I run tests?"). Run them. Only ask when there is a real ambiguity that affects correctness (e.g. product decision with no code clue).

### 2.2 Completion bar: ~95%

- **Only respond "done" or "complete" when the task is at least ~95% complete.**  
  "95%" means: intended behavior implemented, relevant tests run (and fixed if broken), lint clean for changed code, and any docs/APIs you added are consistent with the repo.
- If you cannot reach ~95% (e.g. missing env, external service down), say what is done, what is blocked, and what remains; then write a todo under `.dev/tasks/` for the next agent or human.

### 2.3 Where your work goes

- **Code and config:** Normal repo paths (`api/`, `client/`, `packages/`, `config/`, `e2e/`, etc.).
- **Agent-generated content:**  
  - Guidance, maps, and workflow: `.dev/autonomous-agent/`  
  - Task summaries, plans, and handoffs: `.dev/tasks/`  
  - Generated artifacts (e.g. reports, diagrams): `.dev/artifacts/`  
  Use a clear, friendly folder/file structure under `.dev/` (see [WORKFLOW.md](WORKFLOW.md)).

---

## 3. Workflow Summary

1. Load `.dev` context (MASTER-INSTRUCTION + CONTEXT-LOADING + relevant docs).
2. Infer task scope; optionally write a short plan in `.dev/tasks/`.
3. Implement: edit code, add tests, fix related bugs.
4. Run relevant commands: build, test, lint (see [COMMANDS-AND-SCRIPTS.md](COMMANDS-AND-SCRIPTS.md)).
5. When at ~95%+ complete: respond to the user and **generate a todo** (see below).
6. Write the todo under `.dev/tasks/`.

Details: [WORKFLOW.md](WORKFLOW.md).

---

## 4. Todo Generation (Required After Every Task)

After finishing every task, **generate a todo** and save it under `.dev/tasks/`.

### 4.1 What the todo contains

- **Task completed:** One-line description of what was done.
- **Next steps:** Numbered list of suggested follow-ups (e.g. "Run e2e locally", "Add i18n key for X"). Use "None" if there are no follow-ups.
- **Handoff:** Optional notes for the next agent or human (e.g. "Backend is done; frontend hook still needs error handling").
- **Files/areas touched:** Short list of key paths (e.g. `api/server/routes/...`, `client/src/...`).

### 4.2 File naming and location

- **Path:** `.dev/tasks/`
- **Name:** Prefer descriptive, date-friendly names, e.g.:
  - `YYYY-MM-DD-short-task-name-todo.md`
  - `YYYY-MM-DD-bugfix-issue-123-todo.md`
- **Template:** Use [.dev/tasks/TODO-TEMPLATE.md](../tasks/TODO-TEMPLATE.md) or the structure in [WORKFLOW.md](WORKFLOW.md#todo-file-format).

## 5. Repo Conventions (Quick Reference)

- **Stack:** Node 20.x, npm workspaces. Backend: Express + MongoDB (Mongoose). Frontend: React, Vite, TypeScript. Shared logic in `packages/` (data-provider, api, data-schemas).
- **Naming:**  
  - Branches: slash-based (e.g. `new/feature/x`).  
  - JS/TS: camelCase; React components: PascalCase.  
  - Docs/snake_case for docs where noted.
- **Commits:** Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- **Tests:** Jest for unit; Playwright for e2e. Run tests before calling the task complete.
- **Lint:** ESLint + Prettier. Run `npm run lint` (and fix) for changed code.

More: [.github/CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [CODEBASE-MAP.md](CODEBASE-MAP.md), [COMMANDS-AND-SCRIPTS.md](COMMANDS-AND-SCRIPTS.md).

---

## 6. What Not to Do

- Do not report "done" at 50% (e.g. only backend, no tests).
- Do not leave lint errors in changed files without a clear reason.
- Do not put agent-only docs or task todos in repo root or random places — use `.dev/`.
- Do not ask the user for obvious next steps you can do yourself (run tests, lint, small refactors).
- Do not ignore CONTEXT-LOADING: loading the right docs reduces mistakes and rework.

---

## 7. Summary

1. **Context:** Load `.dev` first (MASTER-INSTRUCTION → AGENT-GUIDANCE → CONTEXT-LOADING + task-specific docs).  
2. **Autonomy:** Investigate, implement, fix bugs, run build/test/lint; only respond when ~95%+ complete.  
3. **Output:** Code in normal paths; agent artifacts in `.dev/` (tasks, artifacts).  
4. **Todo:** After every task, write a todo under `.dev/tasks/` with completed work, next steps, handoff, and files touched.

Following this guidance keeps the repo consistent and gives the next agent (or human) a clear handoff in `.dev/tasks/`.


## Architecture Overview
This is a multi-service AI web application with three main components:
- **UI** (`/ui`): Next.js 15 chat interface using shadcn/ui, Zustand state management, and real-time streaming
- **Server** (`/server`): Fastify API server with SQLite database for CRUD operations on agents, teams, sessions, and runs
- **Runner** (`/runner`): Fastify service that executes agent workflows and streams events back to the UI

Data flows: UI ↔ Server (REST API for data) and UI → Runner (WebSocket/streaming for agent execution).

## Key Patterns & Conventions
- **Modules**: Use ES modules (`"type": "module"`) with `.js` extensions in imports
- **Development**: Run `npm run dev` from root to start all services concurrently with port fallback (3000-3050)
- **Streaming**: Agent runs use event-driven streaming; parse `RunResponseContent` chunks in UI hooks
- **State Management**: UI uses Zustand stores; avoid prop drilling for global state
- **Database**: SQLite with file-based storage; use `Store` interface for data operations
- **Authentication**: Optional Bearer token auth on server routes
- **Components**: shadcn/ui with Tailwind; mobile-first responsive design
- **File Structure**: `/src` for source, flat routing in Next.js app directory

## Critical Workflows
- **Local Development**: Use `./hotreload-test.sh` for hot-reload setup with automatic port assignment
- **Production**: Run `./production.sh` to build and deploy all services
- **Testing**: Run `npm run smoke` per service for basic health checks
- **Dependencies**: Install with `npm ci` in each service directory (server, ui, runner)

## Integration Points
- **Agent Execution**: POST to `/agents/{id}/runs` on server triggers runner job via internal HTTP calls
- **Event Streaming**: Runner emits typed events (`job.started`, `tool.output`, etc.) consumed by UI
- **Session Management**: Sessions auto-created on first run; stored in SQLite with runs appended
- **CORS**: Configured for localhost origins; update `CORS_ORIGIN` env var for production

## Common Pitfalls
- **Ports**: Services bind to 3000/3001/3002 by default; use fallback script to avoid conflicts
- **Environment**: Copy `.env.example` files; UI needs `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_RUNNER_URL`
- **Streaming**: Handle both legacy and new event formats in `useAIResponseStream` hook
- **Database**: Use `SqliteStore` for persistence; falls back to `InMemoryStore` if DB unavailable
- **Build Order**: Always build server/runner before UI due to TypeScript compilation</content>
<parameter name="filePath">/home/heidi/Desktop/aiwebapp/.github/copilot-instructions.md

############################## NEW RULES SET ##########################################

# AUTONOMOUS AGENT SYSTEM CONTRACT

This document defines the mandatory behavior for any autonomous AI agent
working on this repository.

This is NOT a suggestion.
This is a SYSTEM CONTRACT.

---

## 🎯 PRIMARY GOAL

Deliver **positive-only contributions** to the codebase.

“Positive-only” means:
- Fixes bugs without breaking unrelated features
- Adds features without removing existing ones
- Improves UX, DX, clarity, or stability
- Never regresses working behavior

---

## 🔁 MANDATORY AUTONOMOUS EXECUTION LOOP

The agent MUST internally follow this loop:

1) SEARCH
   - Use repo-wide search (rg / grep) to locate:
     - existing implementations
     - source-of-truth files
     - related UI / API / state
   - Never assume behavior.

2) PATCH
   - Apply the **smallest possible change** that satisfies the task.
   - Preserve architecture and naming unless explicitly instructed.
   - Avoid refactors unless they are strictly required.

3) VERIFY
   - Re-check ALL critical invariants (see below).
   - Run build / smoke / grep checks.
   - Confirm no unrelated features disappeared.

4) FIX
   - If verification fails:
     - adjust or revert
     - repeat loop

This loop repeats **only while progress is being made**.

---

## 🛑 STOP CONDITIONS (NO INFINITE CHURN)

The agent MUST STOP when:
- Acceptance criteria are met
- All invariants pass
- Further changes would be speculative or cosmetic
- Changes risk regressions

If unsure → STOP and report findings.
Do NOT keep modifying code.

---

## 🔒 NON-NEGOTIABLE INVARIANTS

These MUST be re-verified on EVERY task.

### UI / UX
- Existing UI controls must not disappear
- No landing banners or demo content reintroduced
- No deprecated controls (PLAN, Replay, Pause, Resume, orange agent bubble)
- Chat vs Agent mode separation preserved

### State / API
- Do NOT rename:
  - state keys
  - request payload keys
  - API fields
- Do NOT break Chat mode if Agent mode fails

### Resilience
- Missing tokens or failed model fetches must NOT break Chat
- Fallbacks must exist (`model = "auto"`)

---

## 🎨 CREATIVE FREEDOM (POSITIVE-ONLY)

The agent is allowed **100% creative freedom** in frontend and backend
ONLY IF ALL are true:

- Change improves clarity, UX, DX, or maintainability
- Existing features remain intact
- No user-visible regression
- No contract is broken
- Benefit can be explained in ONE sentence

### Allowed creativity examples
- Better layout spacing
- Safer error handling
- Clearer UI grouping
- Performance optimizations with same behavior

### Forbidden creativity examples
- Removing UI because “redundant”
- Renaming state keys “for clarity”
- Changing workflows without instruction
- Large refactors during bugfixes

When in doubt: **do less**.

---

## 📐 REQUIRED OUTPUT FORMAT

The agent MUST output responses in this order:

### 1) Findings
- What was missing or broken
- Evidence (files, strings, behaviors)

### 2) Changes Made
File-by-file summary:
✔ ui/src/store.ts — restored system_prompt state
✔ ChatInput.tsx — moved send button inside composer

### 3) Unified Diffs ONLY

diff
diff --git a/file.ts b/file.ts

### 4) Verification

Commands + expected results:

rg "System Prompt" ui/src
npm run build

### 5) Risk Notes

What could break

How to rollback

NO PLAN SECTIONS.
NO NARRATION.
NO ASSUMPTIONS.

EGRESSION PROTECTION (MANDATORY)

If restoring or preserving features:

Add a regression guard (grep / script / test)

Guard MUST fail if feature disappears again

grep -R "System Prompt" ui/src || exit 1

COMMIT MESSAGE FORMAT

If committing:

<scope>: <imperative summary>

- what changed
- why it was necessary
- how it was verified
Exmaple:
ui: restore system prompt menu and composer layout

- re-added system prompt selector above Sessions
- moved send button inside composer
- verified via merge gate + build

FINAL MINDSET

You are not here to:

impress

refactor blindly

optimize prematurely

You ARE here to:

protect working systems

restore missing features

improve safely

behave like a senior engineer

If the task is complete — STOP.

######################################### AGAIN #############################################
# AUTONOMOUS AGENT CONTRACT

You are a fully autonomous software engineer.

Your mission:
Improve the system without breaking ANY existing functionality.

---

## CORE RULES

- Never remove existing features unless explicitly told
- Never break UI, API, or state outside the task scope
- Never assume — always search the repo
- Small, safe changes only
- Creativity is allowed ONLY if it improves things and causes zero regressions

---

## AUTONOMOUS LOOP (MANDATORY)

1. SEARCH  
   - Use repo-wide search to understand current behavior

2. PATCH  
   - Apply minimal changes to achieve the goal

3. VERIFY  
   - Re-check ALL critical features
   - Run build / smoke / grep checks

4. FIX  
   - If anything broke, fix it before continuing

Repeat only while progress is real.

---

## STOP CONDITIONS

STOP immediately when:
- All required features are present
- No regressions detected
- Further changes would be speculative

Do NOT keep changing code after this.

---

## OUTPUT FORMAT (STRICT)

1) Findings  
2) Changes (file-by-file)  
3) Unified diffs only  
4) Verification commands  
5) Risks / rollback notes  

NO plans.  
NO narration.

---

## COMMIT FORMAT

<scope>: <summary>

- what changed
- why
- how verified

---

## FINAL RULE

If fixing one thing breaks another:
THE FIX IS INVALID.
ROLL BACK AND TRY AGAIN.
