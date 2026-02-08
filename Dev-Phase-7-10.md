# Development Plan — Phases 7-10

This document outlines the detailed development plan for Phases 7 through 10 of the AI Web App evolution, building upon the completed Phases 1-6.

## Phase 7: Session & State Enhancements

**Goal**: Make sessions persistent, manageable, and intelligent.

### 1. Session Naming
- **Auto-generation**: Implement a background job or hook that triggers after the first user message to generate a concise session title using a small LLM call (e.g., "Fixing Login Bug").
- **API**: Add `PATCH /sessions/:id` to allow manual renaming.
- **UI**: Allow users to click and rename session titles in the sidebar.

### 2. Session Caching
- **Implementation**: Introduce a `SessionCache` layer (using LRU cache or Redis) in `Store`.
- **Logic**: 
  - On `getSession`, check cache first.
  - On `appendRun`, update cache and write to DB asynchronously (write-behind) or synchronously (write-through) depending on reliability requirements.
  - Configurable TTL (Time To Live).

### 3. History Patterns
- **Modes**:
  - `ALWAYS`: Load last N messages automatically into context (default).
  - `ON_DEMAND`: Agent starts with empty context but can call `get_chat_history` tool.
  - `MANUAL`: Developer explicitly selects messages to include.
- **Config**: Add `historyMode` to `AgentConfig`.

### 4. State API
- **Endpoints**:
  - `GET /sessions/:id/state`: Retrieve arbitrary JSON state.
  - `PATCH /sessions/:id/state`: Update state (merge or replace).
- **Usage**: Allow tools to store task progress or user preferences in `session_state`.

---

## Phase 8: Context Compression & Guardrails

**Goal**: Optimize context window usage and ensure safety.

### 1. Automatic Compression (`CompressionManager`)
- **Trigger**: When conversation history exceeds a token threshold (e.g., 4000 tokens).
- **Action**:
  - Identify oldest messages or verbose tool outputs.
  - Call an LLM to summarize them into a single `system` or `assistant` message.
  - Replace original messages with the summary in the active context (persisting originals in DB).

### 2. Guardrails
- **Middleware**: Add a `GuardrailService` to `LLMService`.
- **Input Guard**: Check user prompts for forbidden terms or PII before sending to LLM.
- **Output Guard**: Scan LLM response for harmful content.
- **Tool Guard**: Restrict tool arguments (e.g., prevent `rm -rf /` in `run_command`).
- **Configuration**: Define policies in `agent_config`.

---

## Phase 9: Hooks, Human-in-the-Loop & Run Cancellation

**Goal**: Control execution flow and enable interactivity.

### 1. Hooks System
- **Event Emitter**: Add typed events to `Agent` class:
  - `on('start', ...)`
  - `on('step', ...)`
  - `on('tool_call', ...)`
  - `on('end', ...)`
- **Usage**: Allow developers to attach custom logging, metrics, or side-effects.

### 2. Human-in-the-Loop (Approval)
- **Tool Config**: Add `requiresApproval: boolean` to `ToolDefinition`.
- **Flow**:
  1. Agent proposes tool call.
  2. Runner pauses and emits `approval_required` event.
  3. UI shows "Approve/Reject" button.
  4. User action resumes execution.
- **API**: `POST /jobs/:id/approve` and `POST /jobs/:id/reject`.

### 3. Run Cancellation
- **AbortSignal**: Pass `AbortSignal` through `Agent.run()` and `LLMService`.
- **API**: `POST /jobs/:id/cancel`.
- **Logic**: Check signal status before every LLM call and tool execution. Gracefully terminate.

---

## Phase 10: Skills, Reasoning, Multimodal, Tracing, Evals

**Goal**: Advanced capabilities for production-grade agents.

### 1. Skills
- **Abstraction**: Create `Skill` class which wraps a set of `Tools`, `SystemPrompt` additions, and `Memory` handlers.
- **Registry**: `SkillRegistry` to manage and compose skills (e.g., `CodingSkill`, `WebSearchSkill`).

### 2. Reasoning Patterns
- **ReAct**: Refine the loop to strictly follow Thought-Action-Observation.
- **Chain-of-Thought**: Inject "Let's think step by step" prompts or use specific CoT models.
- **Parallel Reasoning**: Run multiple models on the same prompt and aggregate results (voting/consensus).

### 3. Tracing & Observability
- **OpenTelemetry**: Instrument `Runner`, `Server`, and `LLMService` with OTel spans.
- **Visualization**: Export traces to Jaeger or Zipkin (or a simple built-in UI viewer).

### 4. Evals
- **Framework**: Build `EvalSuite` to run agents against defined test cases.
- **Metrics**: Success rate, tokens used, latency, tool usage accuracy.
- **Agent-as-Judge**: Use a stronger model (e.g., GPT-4) to grade the output of the agent.

---

## Implementation Schedule (Proposed)

1. **Week 1**: Phase 7 (Session/State) & Phase 9 (Cancellation/Hooks) - High value for UX.
2. **Week 2**: Phase 8 (Compression/Guardrails) - Critical for cost/safety.
3. **Week 3**: Phase 10 (Skills/Tracing) - Scaling and maturity.
