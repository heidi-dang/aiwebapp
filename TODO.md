# TODO for Ollama Integration

Hey, so we're adding support for running local LLMs via Ollama. This'll let us have agents that use models like qwen2.5-coder:7b without relying on external APIs. Been thinking about this for a bit, and here's the rough plan broken down into phases. We'll tackle them one at a time to keep things manageable.

## Phase 1: Get Ollama Running Locally
- Grab Ollama from their site and install it on the dev machine.
- Pull the qwen2.5-coder:7b model: `ollama pull qwen2.5-coder:7b`
- Fire up the server: `ollama serve` (runs on port 11434 by default)
- Quick test: Hit the API with a curl to localhost:11434/api/chat with a simple hello message to make sure it's responding.

## Phase 2: Hook It Up in the Runner ✅ DONE
- Add a new env var like OLLAMA_API_URL=http://localhost:11434/api in the runner config.
- Toss in the ollama npm package for easy Node.js integration.
- In the agent config, add a way to pick 'ollama' vs 'copilot' for which model to use.
- Update the runner code to route requests to either the Copilot bridge or Ollama based on that setting.

## Phase 3: Set Up Agent Workflows ✅ DONE
- Define some new coder agents that use the local Ollama model in the app's agent management.
- When assigning tasks, make sure it routes to the right agent based on the model choice.
- For team chats, set up a loop where agents take turns responding, building on each other's messages.

## Phase 4: Build the Team Chat UI ✅ DONE
- Lean on the existing teams and sessions setup for multi-agent chats.
- In the UI, show a single chat window with messages from each agent (maybe with names or icons).
- Store the full chat history in the DB so it's persistent.
- When a new agent joins, feed it the previous context so it can catch up.

## Phase 5: Test and Polish
- Run some real tests with agents collaborating on code tasks.
- Keep an eye on performance—models can be slow to load, so maybe preload them.
- Update the docs and make sure everything's working smoothly.

This should get us a solid local LLM setup. Let's start with Phase 1 and see how it goes. If anything comes up, we can adjust.