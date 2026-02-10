AI Autonomous Engineering Contract — aiwebapp

This document defines mandatory behavior for any autonomous AI agent working in this repository.

This is a system-level contract.

🎯 PRIMARY OBJECTIVE

Deliver strictly positive, regression-free contributions.

A contribution is valid only if it:

Fixes or improves without breaking unrelated functionality

Preserves existing UI, API, and state behavior

Maintains architectural integrity

Passes verification checks

If unsure → STOP and report findings.

🧠 REQUIRED THINKING MODEL (MANDATORY)

Before modifying code, the agent MUST internally:

Reconstruct the relevant architecture (UI ↔ Server ↔ Runner flow)

Identify the true source-of-truth file

Trace data flow end-to-end

Identify invariants affected

Define smallest safe change

Never patch blindly.

🔁 AUTONOMOUS EXECUTION LOOP

The agent MUST follow this loop:

1) SEARCH

Repo-wide search (rg / grep)

Locate:

source-of-truth

duplicated logic (e.g., guardrail_service.ts)

UI hooks consuming backend output

state definitions

Never assume behavior.

2) ANALYZE

Identify exact failure or improvement point

Confirm no contract violations

Check integration points:

UI ↔ Server REST

Server ↔ Runner internal HTTP

Runner → UI streaming

3) PATCH

Smallest possible change

No speculative refactors

Preserve naming and public contracts

If modifying shared files, ensure all copies remain in sync

4) VERIFY

Re-check ALL invariants:

UI controls preserved

No deprecated elements reintroduced

State keys unchanged

API payloads unchanged

Chat mode resilient if Agent mode fails

Streaming handles both legacy and new formats

Build passes

Smoke tests pass

5) FIX (If Required)

If verification fails:

Revert unsafe change

Apply narrower correction

Repeat loop only if progress is real

🛑 STOP CONDITIONS

STOP immediately when:

Acceptance criteria are satisfied

All invariants pass

Further changes would be cosmetic or speculative

Risk of regression increases

No infinite churn.

🔒 NON-NEGOTIABLE INVARIANTS
UI

No UI controls removed

No landing banners or demo content

No deprecated controls (PLAN, Replay, Pause, Resume, orange agent bubble)

Chat vs Agent mode separation preserved

State / API

Do NOT rename:

state keys

request payload fields

response fields

Preserve Store interface compatibility

SQLite fallback behavior intact

Resilience

Missing model/token must NOT break Chat

model = "auto" fallback required

InMemoryStore fallback must remain functional

🎨 SAFE CREATIVE FREEDOM

Allowed ONLY if ALL are true:

No contract broken

No regression introduced

Improvement measurable in clarity, UX, DX, or safety

Can be justified in one sentence

When in doubt → do less.

📐 REQUIRED OUTPUT STRUCTURE

Agent responses MUST include:

Findings

Changes (file-by-file)

Unified diffs only

Verification commands

Risk / rollback notes

No narrative fluff.
No speculative redesign proposals.

🛡️ REGRESSION GUARDS (MANDATORY)

When restoring a feature, add a guard:

Example:

grep -R "System Prompt" ui/src || exit 1

Guards must fail if feature disappears again.

🧾 COMMIT MESSAGE FORMAT

<scope>: <imperative summary>

what changed

why

how verified

Example:

ui: restore system prompt menu and composer layout

re-added selector above Sessions

restored composer send button position

verified via build + grep guard

FINAL PRINCIPLE

If fixing one issue breaks another:

The fix is invalid.
Revert and try again.

Behave like a senior engineer protecting production systems.

When the task is complete → STOP.