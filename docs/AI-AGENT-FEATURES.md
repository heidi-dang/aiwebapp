# AI Agent Capabilities

This document outlines the advanced autonomous capabilities added to the AI Web App agent, inspired by Aider.

## 1. Git Integration
The agent can now autonomously manage version control, allowing for safe experimentation and checkpointing.

**Tools:**
- `git_commit`: Stage and commit changes with a descriptive message.
- `git_diff`: View changes between commits or the working tree.
- `git_log`: Review recent commit history.
- `git_undo`: Soft reset the last commit to fix mistakes.

**Usage:**
The agent will automatically commit changes after completing logical units of work. If it makes a mistake, it can use `git_undo` to revert and try again.

## 2. Codebase Mapping (Context Awareness)
To improve navigation in large projects, the agent generates a "mental map" of the repository structure.

**Mechanism:**
- **RepoMapper**: Scans the codebase to extract key classes, functions, and exports.
- **Prompt Injection**: This map is injected into the agent's system prompt at the start of every session.

**Benefit:**
The agent knows where files are located and what functions are available without needing to list every directory manually.

## 3. Self-Correction (Linting & Testing)
The agent can verify its own code before asking for user review.

**Tools:**
- `run_test`: Executes project tests (e.g., `npm test`).
- `run_lint`: Runs the linter (e.g., `npm run lint`).

**Workflow:**
1. Plan & Generate Code.
2. Run Tests/Lint.
3. If failure: Analyze error -> Fix code -> Retry.
4. If success: Commit -> Finish.

## 4. Multi-Model Architecture
The agent can switch between different AI models for different phases of the task to optimize for cost and intelligence.

**Configuration:**
- `planner_model`: High-reasoning model (e.g., o1-preview, gpt-4o) for the "Planning" phase.
- `writer_model`: Fast, efficient model (e.g., gpt-4o-mini, qwen2.5-coder) for the "Code Generation" phase.

## 5. Persistent Memory & Web Access
The agent has access to external knowledge and long-term recall.

**Tools:**
- `web_fetch`: Retrieve documentation or tutorials from the web to solve novel problems.
- `memory_store`: Save important context (architectural decisions, user preferences) to a persistent store.
- `memory_search`: Retrieve past learnings to avoid repeating mistakes.

---
*Implemented in `runner/src/agent.ts` and `runner/src/services/*`.*
