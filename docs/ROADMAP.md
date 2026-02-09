# Product Roadmap: Phase 11+

With the MVP (Phases 1-10) complete, the AI Web App is a fully functional, multi-agent platform with human-in-the-loop guardrails. The next phases focus on **Production Readiness**, **Advanced Intelligence**, and **Developer Experience**.

## 🚀 Phase 11: Deployment & Infrastructure (DevOps)
**Goal:** Move from "it runs on my machine" to "it runs anywhere".

- [ ] **Dockerization**: Create `Dockerfile` for Server, Runner, and UI.
- [ ] **Docker Compose**: Orchestrate all services + database with a single `docker-compose up`.
- [ ] **CI/CD Pipeline**: GitHub Actions to run tests (`check:tools`, `smoke`) on every push.
- [ ] **Production Config**: Environment variable validation (schema-based) for production security.

## 🧠 Phase 12: Advanced Intelligence (RAG & Memory)
**Goal:** Give agents "Long-Term Memory" and "Deep Knowledge".

- [ ] **Vector Database**: Integrate a vector store (e.g., `pgvector`, `Chroma`, or local `sqlite-vss`).
- [ ] **RAG Pipeline**:
    - Ingest codebase into vector store.
    - Retrieve relevant code snippets based on user queries (Semantic Search).
- [ ] **Long-Term Memory**: Persist user preferences and facts across sessions (beyond just chat history).

## 🛠️ Phase 13: Expanded Tool Ecosystem
**Goal:** Empower agents to interact with the outside world.

- [ ] **Web Search Tool**: Allow agents to Google/Bing for documentation (e.g., "How do I use Next.js 15?").
- [ ] **Database Tool**: Allow agents to query SQL databases directly (read-only safe mode).
- [ ] **API Tool**: Generic OpenAPI/Swagger client to talk to external services (Stripe, GitHub, Slack).

## 👁️ Phase 14: Observability & Monitoring
**Goal:** Understand *what* the agents are doing and *why*.

- [ ] **OpenTelemetry**: Trace requests from UI -> Server -> Runner -> Agent.
- [ ] **Agent Tracing**: Visualizing the "Thinking Process" (Step 1, Step 2, Tool Call, Result).
- [ ] **Cost Tracking**: Track token usage and cost per user/session.

## 👥 Phase 15: Collaboration & Multi-Tenancy
**Goal:** Enable teams to work together.

- [ ] **Real-Time Collaboration**: Google Docs-style cursor sharing in the editor.
- [ ] **Team Workspaces**: Share agents and sessions within an organization.
- [ ] **Role-Based Access Control (RBAC)**: Admin vs. Developer vs. Viewer roles.

---

## 💡 Recommendation for Immediate Next Step

**Phase 11 (Dockerization)** is the most practical immediate step. It ensures the project is portable and easier for others to contribute to or deploy.

**Phase 13 (Web Search)** is the most "fun" and high-impact feature for the end-user experience right now.
