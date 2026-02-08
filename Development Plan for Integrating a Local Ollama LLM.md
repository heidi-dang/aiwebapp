
Plan for Integrating a Local Ollama LLM

Below is a phased plan to connect a local Ollama server (hosting the qwen2.5-coder:7b model) into the AIWebApp so that it can run multiple autonomous coding agents (plus the Copilot assistant) in a team-chat setting with shared memory.

Phase 1: Install and Run Ollama Locally

Install Ollama on the development machine (via the official installer or homebrew) and pull the desired model: e.g. run ollama pull qwen2.5-coder:7b.

Start the Ollama API server: run ollama serve so that the LLM is accessible via HTTP on port 11434 (Ollama’s default). Ensure no other process is using port 11434.

Test the model manually: use a curl or Node snippet to verify the API responds. For example:

curl http://localhost:11434/api/chat \
  -d '{"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":"Hello!"}]}'


This should return a JSON response from the model. Also, as shown in Ollama’s docs, you can use the ollama npm package in Node:

import ollama from 'ollama';
const resp = await ollama.chat({
  model: 'qwen2.5-coder:7b',
  messages: [{role:'user', content:'Hello!'}],
});
console.log(resp.message.content);


(This is analogous to the example for another model.)

Ensure reliable startup: consider pre-loading the model on boot (e.g. ollama run qwen2.5-coder:7b) to avoid long cold starts, as models can take time to load into memory.

Phase 2: Add Ollama Support to the Runner Backend

Configure a new API endpoint or env var: In the runner service (the Fastify agent runner), add a setting for the Ollama server URL (e.g. OLLAMA_API_URL=http://localhost:11434/api). Currently AI_API_URL points to the Copilot bridge; we can introduce a parallel setting or an option in agent config.

Integrate the Ollama client: Use the ollama Node package or plain HTTP requests in the runner code. For example, when an agent is designated to use the local LLM, send its prompts to OLLAMA_API_URL + '/chat' with JSON payload {"model":"qwen2.5-coder:7b", "messages":[...]}. In Node, this is as simple as:

const resp = await ollama.chat({model:'qwen2.5-coder:7b', messages:chatHistory});


which internally calls http://localhost:11434/api/chat .

Model selection logic: Extend the agent configuration to indicate which model to use. For example, add a field in the agent or task definition (e.g. agent.model = 'ollama' vs 'copilot'). The runner should then route the message either to the Copilot bridge (AI_API_URL) or to the Ollama server accordingly.

Update environment/config files: In runner/.env, set OLLAMA_API_URL=http://localhost:11434/api and ensure RUNNER_URL/SERVER_URL etc. are correct. If using the existing AI_API_URL, one could repurpose it or clearly separate Copilot vs Ollama. (For reference, MetaGPT’s Ollama config uses base_url: 'http://127.0.0.1:11434/api' .)

Phase 3: Define Agent Workflows and Tasks

Create coding-agent personas: In the app’s agent management, register new autonomous “coder” agents that use the local Qwen model. For example, one agent’s role could be “Function A Developer – (using Qwen2.5)” and another “Function B Developer – (Copilot)”. The system already supports defining agents with prompts and roles.

Task assignment: When the user assigns a task (e.g. “Develop function A” vs “Develop function B”), the app should enqueue it to the corresponding agent(s). This may involve creating a new “session” or “run” in the backend tied to the team, and tagging which agent (model) handles each part.

Orchestrate multi-agent chat: Extend the runner to support multi-agent loops. For a team chat, loop through agents: take the current chat history (messages so far) and send it to each agent’s model to get its response. Aggregate or order these responses (simulating a conversation). For example, a cycle could be: agent1 responds, then agent2, etc. Use server-sent events (as the app already streams agent replies) so that the UI can display each agent’s message in real time.

Phase 4: Implement Team Chat Interface and Persistence

Team sessions: Leverage the existing “teams” and “sessions” data models. Create a chat session under a team, where multiple agents are participants. The UI should show a single chat window that displays messages from each agent (and possibly the human user). Assign a distinct name or icon for each agent (e.g. “Qwen2.5 Bot”, “Copilot Bot”).

Chat storage: Store each chat message (role=“assistant”, content) in the database under that session. This builds persistent history of the team discussion. Use the app’s real-time updates (SSE) to append messages to the UI as agents respond.

Memory context: Maintain a memory of past interactions. As noted in the Ollama-Agent tutorial, Ollama itself doesn’t keep conversation state – your system must pass context or use an external memory. In practice, persist the full chat transcript in SQLite (or a vector store) so that if a new agent or participant joins, your code can retrieve and feed the entire history (or a summary) as initial context. For example, before invoking a newly added agent, preload it with the last N messages from this session. This aligns with best practices: either pass prior messages in the prompt or use a memory DB to fetch relevant history.

Retrieval for new agents: When a new agent enters, query the session’s stored messages and include them in its first prompt. You could also summarize long histories and store that summary as a system “memory” for quick catch-up. If needed, integrate a vector memory (e.g. Redis or ChromaDB) to support semantic retrieval from past discussions, as suggested by Amit.

Phase 5: Testing and Iteration

Validate agent teamwork: Test scenarios like “Agent A writes a function stub, Agent B reviews/expands it” and ensure the chat loop flows logically. Check that the agents see each other’s messages.

Debug tool usage: If agents use code execution or tools, make sure those calls appear correctly in the chat (the app supports streaming tool calls).

Performance and scaling: Monitor the Ollama server’s CPU/GPU usage. If models load slowly, consider pre-warming or downsizing model quantization (e.g. Q4_K_M is already applied in qwen2.5-coder:7b).

Finalize memory behavior: Iterate on how much history to feed and how to store it. Ensure new agents effectively catch up by reviewing context. According to the Multi-Agent AI guide, each agent should have “memory” of past messages to inform its actions.

Documentation: Update README/config docs with the new OLLAMA_API_URL and instructions to start the Ollama server (default port 11434). Provide examples of creating agents that use the local model vs Copilot.

By following these phases, the app will support a “team chat” where your local Qwen-based coder agent and the GitHub Copilot assistant collaborate on code tasks. Each agent will run on Ollama or the Copilot bridge as configured, exchanging messages in a shared session and referring to the stored context as their memory. This layered approach (environment setup, integration, multi-agent logic, and memory) ensures a robust, maintainable solution.

Sources: Implementation examples from the Ollama docs and community (showing how to run and call models locally), and multi-agent design guidance (stress on passing context or using external memory). These guide the integration of a local LLM into a collaborative agent system.