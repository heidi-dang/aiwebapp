# AI Web App

A comprehensive AI-powered web application for managing and interacting with autonomous agents. Built with modern web technologies, this application provides a full-stack solution with a Fastify backend, Next.js frontend, and a dedicated runner service for agent execution.

## Features

- 🤖 **Agent Management**: Create, configure, and manage AI agents
- 💬 **Interactive Chat Interface**: Real-time chat with streaming responses
- 🏃 **Agent Runner Service**: Dedicated service for executing agent workflows
- 📊 **Session Tracking**: Monitor and manage chat sessions
- 👥 **Team Collaboration**: Organize agents and sessions by teams
- 🔄 **Real-time Updates**: Live streaming of agent responses and tool calls
- 🎨 **Modern UI**: Built with Next.js, Tailwind CSS, and shadcn/ui components
- 🗄️ **SQLite Database**: Lightweight, file-based database for data persistence
- 🔒 **TypeScript**: Full type safety across the entire stack

## Architecture

This application consists of three main services:

- **Server** (`/server`): Fastify-based API server handling authentication, database operations, and API endpoints
- **UI** (`/ui`): Next.js web application providing the user interface
- **Runner** (`/runner`): Fastify service for executing agent workflows and processing tasks

## CopilotAPI Bridge Integration

The application supports integration with GitHub Copilot via the CopilotAPI Bridge extension, providing access to advanced AI models.

### Local Development Setup

1. Install the CopilotAPI Bridge VS Code extension (already installed).
2. The API server runs on `http://localhost:4000`.
3. Configure environment variables in `ui/.env.local`:
   ```
   AI_API_URL=http://localhost:4000
   AI_API_KEY=<your-api-key>
   ```
4. In the UI, select "CopilotAPI" provider for chat completions using Copilot models.

### Remote Access Setup

The CopilotAPI Bridge only works locally by default. To access CopilotAPI models when connecting from remote domains (like heidiai.com.au), set up a tunnel using either ngrok or Cloudflare Tunnel.

#### Option 1: Using ngrok

1. **Authenticate ngrok:**
   ```bash
   # Get token from https://dashboard.ngrok.com/get-started/your-authtoken
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

2. **Start the tunnel:**
   ```bash
   ./setup-tunnel.sh
   ```
   This creates a secure tunnel exposing `localhost:4000` to the internet.

3. **Update environment variables:**
   ```bash
   ./update-env-with-tunnel.sh
   ```
   This automatically updates your `.env` files with the tunnel URL.

#### Option 2: Using Cloudflare Tunnel (cloudflared)

1. **Ensure cloudflared is installed and authenticated:**
   ```bash
   # Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/
   cloudflared tunnel login
   ```

2. **Start the tunnel:**
   ```bash
   ./setup-cloudflared-tunnel.sh
   ```
   Choose between a named tunnel (with custom domain) or quick tunnel.

3. **Update environment variables:**
   ```bash
   ./update-env-with-cloudflared.sh
   ```
   Enter your tunnel URL when prompted.

#### Common Steps for Both Options

4. **Restart services:**
   ```bash
   npm run dev
   ```

5. **Access remotely:**
   - Your CopilotAPI models will now work from any domain
   - The tunnel URL replaces `http://localhost:4000`
   - Keep the tunnel running for remote access

**Security Note:** Stop the tunnel when not needed to avoid exposing your CopilotAPI Bridge unnecessarily.

### Providers

- **Bridge**: Uses the custom VS Code extension bridge for file operations and agent workflows.
- **CopilotAPI**: Uses the CopilotAPI Bridge for direct chat completions with OpenAI-compatible endpoints.

## Prerequisites

- Node.js 20.x or later
- npm or yarn package manager
- Git

## Quick Start

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/heidi-dang/aiwebapp.git
   cd aiwebapp
   ```

2. **Install dependencies for all services:**
   ```bash
   # Install server dependencies
   cd server && npm ci && cd ..

   # Install UI dependencies
   cd ui && npm ci && cd ..

   # Install runner dependencies
   cd runner && npm ci && cd ..
   ```

3. **Start development servers:**
   ```bash
   # Use the hot reload test script
   ./hotreload-test.sh
   ```

   Or manually:
   ```bash
   # Terminal 1: Start server
   cd server && npm run dev

   # Terminal 2: Start UI
   cd ui && npm run dev

   # Terminal 3: Start runner
   cd runner && npm run dev
   ```

4. **Access the application:**
   - UI: http://localhost:3000
   - Server API: http://localhost:3001 (or configured port)
   - Runner: http://localhost:3002 (or configured port)

## Current Hot Reload Status (2026-02-06)

- Executed `./hotreload-test.sh` locally to verify that all three services boot with the out-of-the-box configuration; no dependency reinstall was requested during this run.
- Port scan selected the default assignments (UI 3000, Server 3001, Runner 3002) and each Fastify instance reported healthy `/health` responses.
- Fresh logs live under `logs/server.log`, `logs/ui.log`, and `logs/runner.log`; `Ctrl+C` cleanly tears everything down because the script traps the signal and kills the child processes.
- When the script rewrites `ui/.env.local` it now sets `NEXT_PUBLIC_API_URL` to the actual server port (e.g., `http://localhost:3001`) so the UI calls the correct endpoint, preventing NetworkErrors from port mismatches.
- The script passes `RUNNER_URL` to the server and `AI_API_URL` (defaulting to `http://192.168.1.16:8080` per user feedback) to the runner for proper inter-service communication.
- Updated server `/agents/:id/runs` route to call the runner's `/api/jobs` endpoint and proxy the SSE events back to the UI, instead of just echoing.

```
[Server] {"msg":"Server listening at http://127.0.0.1:3001"}
[Runner] Using SQLite store: ./runner.db
[Runner] {"msg":"Server listening at http://127.0.0.1:3002"}
[UI]     ▲ Next.js 15.5.10 — Local: http://localhost:3000 (.env.local)
[UI]     ✓ Starting...
```

To repeat the verification later:

1. Kill any lingering dev processes: `pkill -f tsx && pkill -f "next dev"`
2. From the repo root run `bash ./hotreload-test.sh` and press **Enter** to accept the default "skip dependency install" prompt.
3. Watch the aggregated tail output; press **Ctrl+C** when you are done to trigger cleanup.
4. Use `tail -n 40 logs/{server,ui,runner}.log` to review timestamps or share progress with the team.

### Production Deployment

Use the production deployment script:

```bash
./production.sh
```

This script will:
- Build all services
- Configure environment variables
- Start production servers
- Provide access URLs

## Development Scripts

### Hot Reload Development
```bash
./hotreload-test.sh
```
Starts all services in development mode with hot reloading enabled.

### Production Deployment
```bash
./production.sh
```
Builds and deploys all services for production use.

## Project Structure

```
aiwebapp/
├── server/                 # Backend API server
│   ├── src/
│   │   ├── index.ts       # Main server file
│   │   ├── routes/        # API route handlers
│   │   ├── auth.ts        # Authentication logic
│   │   ├── storage.ts     # Database operations
│   │   └── types.ts       # Type definitions
│   ├── package.json
│   └── tsconfig.json
├── ui/                     # Frontend Next.js application
│   ├── src/
│   │   ├── app/           # Next.js app router
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utility functions
│   │   └── store.ts       # State management
│   ├── package.json
│   └── next.config.ts
├── runner/                 # Agent execution service
│   ├── src/
│   │   └── index.ts       # Runner service
│   ├── package.json
│   └── tsconfig.json
├── .dev/                   # Development documentation
├── .github/
│   └── workflows/         # CI/CD workflows
├── .gitignore
├── production.sh          # Production deployment script
├── hotreload-test.sh      # Development startup script
└── README.md
```

## API Documentation

### Server Endpoints

- `GET /health` - Health check
- `GET /agents` - List agents
- `POST /agents` - Create agent
- `GET /sessions` - List sessions
- `POST /sessions` - Create session
- `GET /teams` - List teams
- `POST /teams` - Create team
- `POST /runs` - Execute agent run

### Authentication

The application uses token-based authentication. Include the auth token in the `Authorization` header:

```
Authorization: Bearer <your-token>
```

## Configuration

### Environment Variables

Create `.env` files in each service directory:

#### Server (.env)
```
PORT=3001
DATABASE_URL=./data.db
JWT_SECRET=your-secret-key
```

#### UI (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_RUNNER_URL=http://localhost:3002
```

#### Runner (.env)
```
PORT=3002
SERVER_URL=http://localhost:3001
```

### Important: Environment files & Copilot API — do NOT edit committed env files ⚠️

- **Do not modify or commit** environment files that are tracked in the repository. If you need local overrides, create or edit the service-local env files (for example, `ui/.env.local`, `server/.env`, `runner/.env`) — these files are listed in `.gitignore` and should not be committed.
- The UI forwards Copilot API requests to the host defined by `NEXT_PUBLIC_AI_API_URL`. If that host is unreachable, the UI proxy will return a `502 Bad Gateway` (e.g., "models fetch failed: 502").
- For local development with a locally running Copilot API, set `NEXT_PUBLIC_AI_API_URL` to the Copilot host (for example `http://localhost:8080`).
- Quick debugging steps if you see a `502` when fetching models:
  - Check the UI proxy response: `curl -i http://localhost:3000/api/copilot/v1/models`
  - Check the Copilot API directly: `curl -i http://localhost:8080/v1/models`
- If you need to share environment values, use `.env.example` or a secure channel; do not commit secrets to the repository.
- If you want repository-managed env changes, open an issue and confirm before any automated edits are made.

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use conventional commits for git messages

### Testing

```bash
# Server smoke tests
cd server && npm run smoke

# UI type checking
cd ui && npm run typecheck

# UI linting
cd ui && npm run lint
```

### Building

```bash
# Build all services
cd server && npm run build
cd ../ui && npm run build
cd ../runner && npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and ensure tests pass
4. Commit with conventional commits: `git commit -m "feat: add new feature"`
5. Push to your branch: `git push origin feature/your-feature`
6. Create a Pull Request

### Pull Request Checks

All PRs must pass:
- TypeScript compilation
- ESLint checks
- Build verification
- Smoke tests

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Port fallback behavior

When running the bundled `hotreload-test.sh`, the script will try to bind the default ports:

- UI: 3000..3050 (starts at 3000)
- Server: 3001..3050 (starts at 3001)
- Runner: 3002..3050 (starts at 3002)

If a default port is already in use, the script will increment to the next available port within the 3000–3050 range and start the service there. The chosen ports are printed when the script starts, and health checks use those actual ports. This helps avoid EADDRINUSE errors during local development.

## Support

For questions or issues:
- Create an issue on GitHub
- Check the `.dev/` folder for development documentation
- Review the autonomous agent guidelines in `.dev/autonomous-agent/`</content>
<parameter name="filePath">/home/heidi/Desktop/aiwebapp/README.md