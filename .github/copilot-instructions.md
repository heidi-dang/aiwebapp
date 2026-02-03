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