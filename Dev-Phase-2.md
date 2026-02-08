Development Plan — State 2


This development plan outlines how to evolve the current AI Web App into a fully‑fledged multi‑agent platform inspired by the Agno SDK.  The goal of State 2 is to implement all missing capabilities identified in the Agno comparison report, resulting in a modular, extensible and production‑ready system.



Objectives
Abstract Agent Framework – Create a generic agent engine that supports memory, knowledge, tools and debugging.  The CoderAgent becomes an example implementation rather than the only agent.

Team Support – Allow multiple agents (and nested teams) to collaborate under a team leader with configurable delegation patterns.

Workflow Engine – Introduce a workflow system to orchestrate agents, teams and functions with sequential, parallel, loop and conditional steps.

Structured & Multimodal I/O – Support schema‑validated input and output, and handle images, audio, video and file attachments.

Knowledge & Learning – Provide a knowledge base for document retrieval and a learning module to accumulate user profiles, session context, memory and learned knowledge.

Model Configuration – Allow specifying different models for reasoning, parsing and output, including provider compatibility checks and fallback strategies.

Tool Registry – Build a dynamic registry for built‑in and custom tools with metadata and runtime execution.

Session & State Management – Expand session features to include naming, caching, history patterns, session summaries and persistent state across runs.

Context Compression & Guardrails – Implement summarisation of verbose outputs and enforce safety guardrails on agent responses and tool calls.

Advanced Features – Add hooks, human‑in‑the‑loop, run cancellation, skills, reasoning frameworks, multimodal processing, tracing, evals, memory modules, culture configuration and custom logging.



Phase Breakdown


Phase 1: Modular Agent Framework
Define a base Agent class (runner/src/agent_base.ts)

Properties: id, name, model, tools, memory_store, knowledge_store, session_state, debug flag.

Methods: run(input), arun(input), build_context(), call_llm(), handle_tool_calls(), debug_log().

Support streaming events and error handling similar to the existing CoderAgent.

Persist session_state and memory to the database via server APIs.

Implement optional output_schema and input_schema validation using a TypeScript schema library (e.g., ZodAttachment.png).

Memory & State Management

Add a memory table to the server database storing messages, tool calls and summarised context keyed by session_id and agent_id.

Create API endpoints in /server/routes/memory.ts for reading/writing memory.

Implement session_state (key‑value store) persisted in a new state table with JSON blobs.  Provide endpoints for reading/updating state.

Tool Registry

Introduce a ToolRegistry class with registerTool(name, description, parameters, handler) and getTools() methods.

Move hard‑coded tools from CoderAgent into registry registration calls (e.g., at service startup).  Each tool handler receives session_state and context.

Expose registry metadata to the LLM by generating a JSON schema describing available tools.

Debugging & Tracing

Add a debug flag to agents which, when enabled, records each step (prompts, tool calls, outputs, token usage) into a trace table.

Provide an API endpoint and UI panel for viewing traces by session or run.

Refactor CoderAgent

Rewrite CoderAgent to extend the base Agent and register its specific tools.  Move the planning/execution/review state machine into this class while leveraging base functionality for memory, model calls and tool handling.



Phase 2: Team Support
Create a Team class (runner/src/team.ts)

Properties: id, name, leader (an Agent instance), members (array of agents or teams), delegation_pattern (supervisor, router, broadcast), respond_directly, determine_input_for_members callback.

Methods: run(input) and arun(input) that orchestrate delegation according to the pattern:

Supervisor: leader calls members and synthesizes their responses into a final output.

Router: leader decides which member(s) to delegate based on input or context and passes their outputs directly back to the caller.

Broadcast: all members receive the same input and their results are combined.

Inherit memory, knowledge and state from leader by default with options to override.

Extend server routes

Add API endpoints for creating/updating/deleting teams, managing membership and delegation settings: /teams/:id/members, /teams/:id/config.

Persist team definitions in database tables.

Modify session storage to support entity_type = 'team' and store team runs.

UI updates

Create pages and components to configure teams: define leader, add/remove members, select delegation pattern and input handling options.

Display team run history and allow triggering team runs.



Phase 3: Workflow Engine
Design workflow primitives

Define Workflow class containing a list of Step objects.  Steps may be of types AgentStep, TeamStep, FunctionStep, LoopStep, ParallelStep, ConditionStep, RouterStep.

Provide run(input) and arun(input) methods which iterate through steps and manage data flow using StepInput/StepOutput objects.

Add support for Loop (execute a step until a condition is met), Parallel (execute multiple steps concurrently), Condition (branching) and Router (mapping keys to steps).

Persist workflows

Create database tables to store workflow definitions and workflow_runs with run history and step outputs.

Add server routes: /workflows, /workflows/:id/runs and /workflows/:id/execute to list, create and run workflows.

Runner integration

Extend runner to interpret workflow definitions and run them across agent/team processes.  Manage parallel execution with async tasks or worker threads.

UI builder

Build a visual or form‑based workflow editor to allow users to assemble steps, define conditions, loops and parallel branches.

Display workflow run progress with step‑wise events and outputs.



Phase 4: Structured & Multimodal I/O
Schema definitions

Use zod in the UI and yup or joi in the server to define input and output schemas.  Agents can specify inputSchema and outputSchema in their definitions.

Validate incoming user input on the server and coerce or reject invalid data.

For structured outputs, parse the model responses based on the schema and return typed objects to the client.

Multimodal support

Extend the UI chat component to accept image, audio, video and file uploads.  Encode attachments as base64 or store them in cloud storage and provide accessible URLs.

Modify agent run functions to accept attachments; wrap them as objects with metadata (Image, Audio, etc.) when calling the model API.

Ensure the model provider supports multimodal input (e.g., OpenAI’s GPT‑4o).  If not, fallback to text only or integrate a model that does.

Output model pipeline

Provide configuration for reasoningModel, outputModel and parserModel.  After the reasoning model produces a response, optionally send it to the output model to improve style or quality, then use a parser model or regex to extract structured data.

Expose these options via the agent configuration UI.



Phase 5: Knowledge & Learning
Knowledge ingestion

Implement an ingestion service (server/src/knowledge.ts) that accepts files, URLs or raw text.  Use a Python or Node embedding service to chunk and embed documents (e.g., OpenAI embeddings or local model).  Store embeddings and metadata in a new knowledge table and knowledge_chunks table.

Provide endpoints to upload documents and list knowledge sources.

Retrieval as a tool

Register a search_knowledge tool that accepts a query, retrieves relevant chunks using vector similarity search (via an embedding database such as pgvector or qdrant), and returns the top passages.

Integrate with agents so they can call this tool when needed.

Learning machine

Add tables for user_profiles, session_contexts, entity_memory and learned_knowledge.  Define functions to update these tables after each run.

Provide configuration for learning modes (ALWAYS, AGENTIC, PROPOSE).  In ALWAYS mode, learned insights are automatically stored and retrieved; in AGENTIC mode, the agent decides when to use them; in PROPOSE mode, ask the user before saving or recalling learned knowledge.

Provide UI to view and manage learned knowledge and user profiles.



Phase 6: Model Configuration & Provider Support
Model registry

Define a configuration file or database table listing supported providers (OpenAI, Anthropic, etc.), model IDs, features supported (streaming, tool calling, multimodal) and cost estimates.

Provide a UI for selecting the reasoning model, output model and parser model per agent or team.

Build a wrapper class around each provider to unify the API interface and handle retries, streaming and tool call support.

Fallback strategies

If the primary model fails, implement fallback to a secondary model.  Configurable by user with fallback order.



Phase 7: Session & State Enhancements
Session naming & caching

Allow users to name sessions explicitly via UI.  Default to auto‑generated names using a model (e.g., summarise the user’s query into a name).

Implement cache_session setting: store session objects in memory for quick recall during interactive sessions; flush them to the database periodically.

History patterns

Provide three history modes: always (include previous messages automatically), on_demand (the model can call get_chat_history tool to retrieve history) and manual (developer chooses messages).  Add settings per agent/team.

Session summaries

Implement automatic summarisation of long conversations using a summarisation model (e.g., openai:gpt-3.5-turbo).  Store summaries in a session_summaries table.  Provide settings for summary length and frequency.

Insert session summaries into context when the conversation exceeds a threshold number of messages or tokens.

Workflow sessions

Persist workflow runs in workflow_sessions and workflow_runs tables.  Provide retrieval of past run data to inform new workflow runs.  Add a setting add_workflow_history_to_steps to include previous run outputs in new runs.

State API

Expose endpoints for reading and updating session state from tools.  Provide a UI component for developers to inspect and modify state.



Phase 8: Context Compression & Guardrails
Automatic compression

Add a CompressionManager that triggers summarisation of tool outputs when they exceed a token threshold.  Use a summarisation model (e.g., openai:gpt-3.5-turbo) to generate short summaries preserving critical facts.

Provide settings for token thresholds, models and summary prompts.

Guardrails

Define guardrail policies (e.g., avoid sensitive content, maintain safe commands).  Implement pre‑ and post‑LLM checks using heuristics or a separate safety model (e.g., OpenAI content moderation API).

Block or rewrite messages and tool calls that violate policies.  Provide overrides for trusted users.



Phase 9: Hooks, Human‑in‑the‑Loop & Run Cancellation
Hooks

Add lifecycle hooks (e.g., beforePrompt, afterPrompt, beforeToolCall, afterToolCall).  Developers can register functions to these hooks to customise behaviour.

Expose hook registration API and documentation.

Human‑in‑the‑Loop

Allow user approval before executing tool calls or final responses.  In the UI, present the proposed tool call or response and let the user approve, modify or reject.

Provide settings per agent/team/workflow for requiring approval for certain actions (e.g., external API calls, code execution).

Run cancellation

Implement a mechanism to cancel a running agent/team/workflow.  Expose cancellation tokens from the runner to the server and UI.  Provide a “Cancel” button in the UI that signals the runner to abort execution gracefully.



Phase 10: Skills, Reasoning, Multimodal, Tracing, Evals & Memory Modules
Skills

Define a Skill abstraction grouping a set of tools and functions around a capability (e.g., FileManagementSkill, WebSearchSkill).  Skills can be registered and imported into agents/teams easily.

Provide a repository of built‑in skills and a mechanism for users to develop custom skills.

Reasoning patterns

Support reasoning frameworks like ReAct (Reason+Act) or chain‑of‑thought.  Provide templates and instructions in agent definitions, and optionally expose reasoning steps to the user.

Implement parallel_reasoning where multiple models evaluate sub‑questions in parallel and aggregate results.

Advanced multimodal

Expand multimodal handling beyond attachments: allow agents to generate images or audio as outputs.  Integrate with model providers that support image generation and implement a generate_image or generate_audio tool.

Provide a viewer in the UI for generated images or audio.

Tracing & observability

Centralise logs and traces across services.  Use a service like OpenTelemetryAttachment.png to instrument the server, runner and UI, capturing spans for each run, tool call and database access.  Export traces to a backend (e.g., Grafana Tempo).

Provide dashboards to visualise latencies, error rates and token usage.

Evals

Implement evaluation modules to assess agent and workflow performance.  Reuse the plan from eval_implementation_plan.md for accuracy, performance, reliability and agent‑as‑judge evals.  Create endpoints to run eval suites and store results in evals tables.  Provide UI pages to view eval scores and improvements.

Memory modules

Support multiple memory types: short‑term memory (recent messages), long‑term memory (summarised sessions), knowledge memory (learned facts) and semantic memory (entity relationships).  Implement retrieval strategies combining these memories.

Culture & custom logging

Allow configuring agent “culture” (personality) via system prompts and style parameters.  Provide a UI to select from predefined cultures (formal, friendly, expert, etc.) or define custom persona prompts.

Expose logging settings to adjust verbosity and select log destinations (console, file, remote service).  Provide structured logs in JSON format for machine parsing.



Implementation Considerations
Incremental delivery – Prioritise critical features (modular agents, tool registry, team support and workflow engine) before adding advanced capabilities.  Each phase should deliver a usable system without requiring the completion of later phases.

Scalability & performance – Use asynchronous code and worker threads to run agents and workflows concurrently.  For heavy tasks like embeddings, consider offloading to background jobs or external services.

Security – Enforce strong access controls on tools (command allowlists), database operations and external API calls.  Implement rate limits and input validation to prevent abuse.

Testing & monitoring – Add unit and integration tests for each new module.  Use smoke tests in the repository to ensure all services work together.  Monitor performance metrics and adjust resource allocations accordingly.

Documentation & examples – Provide thorough documentation for developers and users: how to create agents, teams and workflows; how to register tools and skills; configuration options for models, sessions and learning.  Include sample scripts demonstrating typical use cases.



By following this plan, the AI Web App will evolve into a robust, extensible platform that embraces the full capabilities of the Agno SDK while remaining tailored to your specific requirements

