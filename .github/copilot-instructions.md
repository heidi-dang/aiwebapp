# AI Coding Agent Instructions for aiwebapp

## Architecture Overview
Multi-service AI web app:
- **UI** (`ui/`): Next.js 15 chat interface with shadcn/ui, Zustand stores (e.g., `ui/src/store.ts`), Tailwind CSS
- **Server** (`server/`): Fastify API with SQLite DB (Store interface in `server/src/storage.ts`), CRUD for agents/teams/sessions/runs
- **Runner** (`runner/`): Fastify service executing agent workflows, streaming events to UI

Data flows: UI ↔ Server (REST) for data; UI → Runner (WebSocket/streaming) for execution.

## Key Patterns & Conventions
- **Modules**: ES modules (`"type": "module"`), import with `.js` extensions (even for `.ts` files)
- **Development**: `npm run dev` from root starts all services (ports 3000-3002 with fallback); use `./hotreload-test.sh` for hot-reload
- **Streaming**: Parse `RunResponseContent` chunks in `ui/src/hooks/useAIResponseStream.tsx`; handle legacy/new event formats
- **State**: Zustand with persist middleware; avoid prop drilling
- **Database**: SQLite file-based; `SqliteStore` with `InMemoryStore` fallback
- **Auth**: Optional Bearer token on server routes
- **Components**: shadcn/ui, Tailwind, mobile-first; PascalCase
- **File Structure**: `/src` for source; flat Next.js app routing
- **Naming**: camelCase for JS/TS; conventional commits

## Critical Workflows
- **Build/Deploy**: `./production.sh` builds and deploys all services
- **Testing**: `npm run smoke` per service (e.g., `ui/smoke.mjs`)
- **Dependencies**: `npm ci` in each service dir

## Integration Points
- **Execution**: POST `/agents/{id}/runs` on server triggers runner via internal HTTP
- **Events**: Runner emits typed events (`job.started`, `tool.output`) consumed by UI
- **Sessions**: Auto-created on first run; stored in DB with runs appended

## Common Pitfalls
- **Ports**: Default 3000/3001/3002; use fallback for conflicts
- **Env**: Copy `.env.example`; UI needs `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RUNNER_URL`
- **Streaming**: Ensure both formats handled in hooks
- **DB**: Use Store interface; fallback if DB unavailable
- **Build Order**: Build server/runner before UI

## Autonomous Agent Contract
Follow the contract in `AGENTS.MD` for positive-only contributions, mandatory loop (SEARCH-PATCH-VERIFY-FIX), non-negotiable invariants (preserve UI controls, state keys, resilience), and strict output format.</content>
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
