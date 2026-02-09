# AI Web App - End-to-End Demo Script

This document outlines the steps to demonstrate the full capabilities of the AI Web App, covering Agent Creation, Chat, Tool Execution, and Human-in-the-Loop workflows.

## Prerequisites

1.  **Environment**: Ensure the application is running.
    ```bash
    npm start
    ```
    *   UI: http://localhost:3000
    *   Server: http://localhost:3001
    *   Runner: http://localhost:3002

2.  **Browser**: Open http://localhost:3000 in your browser.

## Scene 1: Agent Creation

1.  **Navigate**: Go to the **Agents** tab (or Home if it defaults there).
2.  **Action**: Click **"Create New Agent"**.
3.  **Input**:
    *   **Name**: `Demo Coder`
    *   **Role**: `Senior Developer`
    *   **Goal**: `Assist with coding tasks and file operations.`
    *   **Model**: Select `GPT-4o` (or `Ollama` if running locally).
4.  **Verify**: Click **Save**. The agent should appear in the list.

## Scene 2: Interactive Chat & Reasoning

1.  **Select**: Click on the `Demo Coder` agent to open the chat interface.
2.  **Prompt**: Type: *"Hello! Who are you and what can you do?"*
3.  **Observation**:
    *   Watch the streaming response.
    *   The agent should introduce itself based on the system prompt we configured.

## Scene 3: Tool Execution (Read/Write)

1.  **Prompt**: Type: *"Create a file named `demo.txt` with the content 'Hello from Phase 10!' and then read it back to me."*
2.  **Observation**:
    *   **Thinking**: You should see a "Thinking..." indicator or a "Running tool..." status.
    *   **Tool Call**: The agent will call `write_file`.
    *   **Tool Call**: The agent will call `read_file`.
    *   **Response**: The agent confirms the file was created and displays its content.

## Scene 4: Human-in-the-Loop (Approval)

*Note: This demonstrates the Phase 9 feature.*

1.  **Prompt**: Type: *"Run the command `rm demo.txt` to clean up."*
2.  **Observation**:
    *   **Status**: The chat should pause or show an "Approval Required" state (depending on UI implementation).
    *   **Runner Log**: If checking logs, you'll see an `approval.request` event.
    *   **Action**: In the UI (if implemented) or via API/Toolbox, approve the request.
    *   **Result**: The command executes only *after* approval.

    *(Self-Correction: If UI for approval isn't fully visible, check the runner logs to confirm the request was intercepted.)*

## Scene 5: Session Persistence

1.  **Action**: Refresh the page.
2.  **Navigate**: Go back to the chat with `Demo Coder`.
3.  **Observation**: The previous conversation (including the `demo.txt` interaction) should still be visible.

## Scene 6: Toolbox & Developer Experience (Optional)

1.  **Terminal**: Open a new terminal.
2.  **Command**: Run `npm run toolbox -- list-files "ui/src/components"`
3.  **Observation**: Verify the toolbox CLI works for developers.

## Troubleshooting

*   **Agent not responding**: Check `runner` terminal for errors.
*   **Approval stuck**: Use the toolbox or API to approve if the UI button is missing (Phase 9 backend is ready, UI might be minimal).
*   **Connection lost**: Ensure all 3 services (Server, Runner, UI) are running in the `npm start` terminal.
