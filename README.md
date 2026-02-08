# AI Web App

A comprehensive AI-powered web application for managing and interacting with autonomous agents. Built with modern web technologies, this application provides a full-stack solution with a Fastify backend, Next.js frontend, and a dedicated runner service for agent execution.

## Websites

- **Main Website**: [https://heidiai.com.au](https://heidiai.com.au) - Landing page with company information
- **AI Platform**: [https://ai.heidiai.com.au](https://ai.heidiai.com.au) - Full AI web application

## Features

- 🤖 **Agent Management**: Create, configure, and manage AI agents with custom system prompts
- 💬 **Interactive Chat Interface**: Real-time chat with streaming responses and tool execution
- 🏃 **Agent Runner Service**: Dedicated service for executing agent workflows and processing tasks
- 📊 **Session Tracking**: Monitor and manage chat sessions with persistent history
- 👥 **Team Collaboration**: Organize agents and sessions by teams
- 🔄 **Real-time Updates**: Live streaming of agent responses and tool calls via Server-Sent Events
- 🎨 **Modern UI**: Built with Next.js 15, Tailwind CSS, and shadcn/ui components
- 🗄️ **SQLite Database**: Lightweight, file-based database for data persistence
- 🔒 **TypeScript**: Full type safety across the entire stack
- 🚀 **Hot Reload Development**: Concurrent development servers with automatic port fallback
- 🛠️ **Toolbox CLI**: Developer utilities for file operations, searching, and safe command execution
- 🌐 **Copilot Integration**: Direct integration with GitHub Copilot via VSCode extension bridge

## Architecture

This application consists of three main services that communicate via HTTP APIs:

- **Server** (`/server`): Fastify-based API server handling authentication, database operations, CRUD for agents/sessions/teams, and API proxying
- **UI** (`/ui`): Next.js web application providing the modern chat interface with real-time streaming
- **Runner** (`/runner`): Fastify service for executing agent workflows, processing tool calls, and managing job queues

### Data Flow

```
UI (Port 3000+) ↔ Server (Port 3001+) ↔ Runner (Port 3002+)
    ↑                                               ↑
    └─────────────── Copilot API Bridge ────────────┘
```

**Note**: Ports start from the defaults shown but automatically increment (3000-3050) if the default ports are in use, ensuring compatibility with shared development environments.

### Service URLs and APIs

For tunneling or external access, the following services and endpoints are available:

#### UI Service (Port 3000+)
- **URL**: `http://localhost:{PORT}` (dev) / `https://ai.heidi.com.au` (prod)
- **Purpose**: Web interface for chat and agent management
- **Key Routes**:
  - `/` - Main chat interface
  - `/api/config` - Configuration endpoint
  - `/api/runner/*` - Proxy to runner service
  - `/api/toolbox/*` - Developer toolbox endpoints

#### Server API (Port 3001+)
- **URL**: `http://localhost:{PORT}` (dev) / `https://api.ai.heidi.com.au` (prod)
- **Purpose**: REST API for data management
- **Key Endpoints**:
  - `GET /health` - Health check
  - `GET/POST /api/agents` - Agent CRUD
  - `GET/POST /api/teams` - Team management
  - `GET/POST /api/sessions` - Session management
  - `GET/POST /api/runs` - Agent execution runs
  - `GET/POST /api/auth` - Authentication
  - `GET/POST /api/memory` - Memory management
  - `GET/POST /api/knowledge` - Knowledge base
  - `GET/POST /api/toolbox` - Developer utilities

#### Runner Service (Port 3002+)
- **URL**: `http://localhost:{PORT}` (dev) / `https://runner.ai.heidi.com.au` (prod)
- **Purpose**: Agent execution and job processing
- **Key Endpoints**:
  - `GET /health` - Health check
  - `GET /test` - Test endpoint
  - `GET/POST /api/jobs` - Job management (create, list, start, cancel, delete)
  - `GET /api/jobs/{id}/events` - Server-Sent Events stream for job updates

#### Copilot API Bridge (Port 4000)
- **URL**: `http://localhost:4000` (dev) / `https://copilot.ai.heidi.com.au` (prod)
- **Purpose**: VS Code Copilot integration
- **Key Endpoints**:
  - `GET /v1/models` - Available models
  - `POST /v1/chat/completions` - Chat completions

**Tunneling Note**: When setting up Cloudflare/ngrok tunnels, ensure all three main service ports are tunneled. Update environment variables with the tunnel URLs for proper cross-service communication.

## Prerequisites

- **Node.js 20.x or later** (required for all services)
- **npm** or **yarn** package manager
- **Git** for version control
- **VSCode** with CopilotAPI Bridge extension (for Copilot integration)
- **SQLite3** (automatically installed via npm)

## Quick Start

### Development Environment

The easiest way to get started is using the hot reload development script:

```bash
# Clone the repository
git clone https://github.com/heidi-dang/aiwebapp.git
cd aiwebapp

# Start all services with hot reload
./hotreload-test.sh
```

This script will:
- ✅ Install dependencies for all services (optional prompt)
- ✅ Find available ports (3000-3050 range with fallback)
- ✅ Configure environment variables automatically
- ✅ Start all three services concurrently
- ✅ Set up logging and health checks
- ✅ Provide access URLs

**Default Ports:**
- UI: `http://localhost:3000`
- Server: `http://localhost:3001`
- Runner: `http://localhost:3002`

### Registration Page (UI Port 3006)

This branch includes a simple registration page:

- **Register URL:** `http://localhost:3006/register`

To run the UI on port 3006 (without changing the default dev scripts), use:

```bash
cd ui
npm run dev:3006
```

### OAuth Social Login

Social login is implemented on the server with these routes:

- `GET /auth/oauth/:provider/start`
- `GET /auth/oauth/:provider/callback`

Providers:
- `google`
- `github`
- `apple`
- `microsoft`

#### Required environment variables (server)

Configure in `server/.env`:

```bash
# Needed when running behind a public URL / tunnel so redirect_uri matches exactly
SERVER_PUBLIC_URL=http://localhost:7777

# Recommended: secret used to sign/verify OAuth state
OAUTH_STATE_SECRET=change_me

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
```

OAuth callback URL pattern (configure these in each provider dashboard):

```
{SERVER_PUBLIC_URL}/auth/oauth/{provider}/callback
```

### Manual Development Setup

If you prefer manual setup:

```bash
# Install dependencies
npm run bootstrap

# Initialize environment files
npm run init:env

# Start all services
npm run dev
```

### Shared Machine / Branch-Only Dev Ports

If you are developing on a shared machine where default ports may already be in use, this branch includes an isolated dev mode that runs on a dedicated port set:

```bash
npm run dev:phase2
```

Ports used by `dev:phase2`:
- UI: `http://localhost:3200`
- Server: `http://localhost:3201`
- Runner: `http://localhost:3202`

Smoke tests for this port set:

```bash
npm run smoke:phase2
```

Important:
- These `*:phase2` scripts are intended for local development convenience on shared machines.
- The default scripts (`dev`, `start`, `smoke`) and production environment configuration remain unchanged and should follow the main branch defaults.

### Branch-Only Dev Scripts (UI 3006)

If you want to run the full stack while keeping the UI specifically on port 3006, use these additional scripts:

```bash
npm run dev:ui3006
```

Production-style start (UI on 3006):

```bash
npm run start:ui3006
```

Smoke tests for this port set:

```bash
npm run smoke:ui3006
```

### Production Deployment

For production deployment to https://ai.heidi.com.au:

```bash
# Build and deploy
./production.sh
```

This will build all services and start them in production mode. Configure your reverse proxy or load balancer to route:
- `ai.heidi.com.au` → UI service
- `api.ai.heidi.com.au` → Server API
- `runner.ai.heidi.com.au` → Runner service
- `copilot.ai.heidi.com.au` → Copilot bridge (if used)

## CopilotAPI Integration

### VSCode Extension Setup

1. **Install the CopilotAPI Bridge Extension:**
   - Open VSCode
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "CopilotAPI Bridge"
   - Install the extension by the author

2. **Start the Bridge:**
   - The extension will start a local server (default: `http://localhost:8080`)
   - This provides OpenAI-compatible endpoints for Copilot models

### Environment Configuration

The application connects to Copilot through the bridge. Configure in `ui/.env.local`:

```bash
# Copilot API Bridge URL (local development)
NEXT_PUBLIC_AI_API_URL=http://localhost:8080

# For production/remote access, use tunnel URL
NEXT_PUBLIC_AI_API_URL=https://your-tunnel-url.com
```

### Remote Access Setup

For accessing Copilot models from remote domains (like production deployments), set up a tunnel:

#### Option 1: ngrok Tunnel

```bash
# Install ngrok and authenticate
npm install -g ngrok
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel to Copilot bridge
./setup-tunnel.sh

# Update environment
./update-env-with-tunnel.sh
```

#### Option 2: Cloudflare Tunnel

```bash
# Install cloudflared
# Follow: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/

# Authenticate
cloudflared tunnel login

# Start tunnel
./setup-cloudflared-tunnel.sh

# Update environment
./update-env-with-cloudflared.sh
```

### Testing Copilot Connection

```bash
# Test bridge directly
curl http://localhost:8080/v1/models

# Test through UI proxy
curl http://localhost:3000/api/copilot/v1/models
```

## Tunneling for Remote Access

For full remote access to the application (not just Copilot), you'll need to tunnel all three main services. The ports are dynamic (starting from 3000, 3001, 3002) and will be displayed when starting the services.

### Using ngrok for All Services

```bash
# Install ngrok
npm install -g ngrok
ngrok config add-authtoken YOUR_TOKEN

# Start tunnels for each service (replace PORTS with actual ports from startup)
ngrok http 3000  # UI
ngrok http 3001  # Server API
ngrok http 3002  # Runner

# Update environment variables with tunnel URLs
# In ui/.env.local:
NEXT_PUBLIC_API_URL=https://api.ai.heidi.com.au
NEXT_PUBLIC_RUNNER_URL=https://runner.ai.heidi.com.au

# In runner/.env:
AI_API_URL=https://copilot.ai.heidi.com.au  # if using Copilot
```

### Using Cloudflare Tunnel for All Services

```bash
# Create tunnels for each service
cloudflared tunnel --url http://localhost:3000  # UI
cloudflared tunnel --url http://localhost:3001  # Server
cloudflared tunnel --url http://localhost:3002  # Runner

# Configure DNS and update environment variables as above
```

**Note**: Always check the actual ports used by running `./hotreload-test.sh` or `./production.sh` and update tunnel configurations accordingly.

## Ollama Integration

We're adding support for local LLMs via Ollama. This lets you run agents with models like qwen2.5-coder:7b on your own machine, which is great for offline work or keeping things local.

### Setup

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull the model: `ollama pull qwen2.5-coder:7b`
3. Start the server: `ollama serve` (it runs on port 11434 by default)

### Configuration

In `runner/.env`, add:
```
OLLAMA_API_URL=http://localhost:11434/api
```

Agents can now be configured to use 'ollama' as their model instead of Copilot. We'll be expanding this as we implement the full integration.

### Testing

Quick test the API:
```bash
curl http://localhost:11434/api/chat \
  -d '{"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":"Hello!"}]}'
```

More details coming as we build this out.

## Environment Configuration

### Development Environment Variables

#### Server (`server/.env`)
```bash
# Server configuration
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Database
DB_PATH=./server.db

# Runner communication
RUNNER_URL=http://localhost:3002

# Optional: Authentication
AUTH_TOKEN=your_server_token
```

#### UI (`ui/.env.local`)
```bash
# API endpoints
NEXT_PUBLIC_API_URL=http://localhost:3001
RUNNER_URL=http://localhost:3002
RUNNER_TOKEN=test_runner_token_123

# Copilot integration
NEXT_PUBLIC_AI_API_URL=http://localhost:8080

# Optional: OS integration
NEXT_PUBLIC_OS_SECURITY_KEY=your_os_token
```

#### Runner (`runner/.env`)
```bash
# Runner configuration
PORT=3002
CORS_ORIGIN=http://localhost:3000

# Authentication
RUNNER_TOKEN=test_runner_token_123

# AI API (Copilot bridge)
AI_API_URL=http://localhost:8080

# Database
RUNNER_DB=./runner.db
RUNNER_PERSIST=true

# Optional: VSCode bridge integration
BRIDGE_URL=http://127.0.0.1:3210
BRIDGE_TOKEN=your_bridge_token
```

### Production Environment Variables

For production, update the URLs to your actual domain:

```bash
# ui/.env.local
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
RUNNER_URL=https://yourdomain.com/runner
NEXT_PUBLIC_AI_API_URL=https://your-copilot-tunnel.com

# server/.env
CORS_ORIGIN=https://yourdomain.com
RUNNER_URL=https://yourdomain.com/runner

# runner/.env
AI_API_URL=https://your-copilot-tunnel.com
```

## Development Workflow

### Hot Reload Development

The `hotreload-test.sh` script provides the optimal development experience:

```bash
./hotreload-test.sh
```

**Features:**
- Automatic port detection (3000-3050 range)
- Concurrent service startup
- Live log tailing with colored output
- Health checks for all services
- Automatic environment configuration
- Clean shutdown on Ctrl+C

**Important for Shared Development Environments:**

Since multiple developers may work on the same physical machine, the script allows automatic port fallback if default ports (3000-3002) are in use. However, when preparing code for PR/merge to main:

- Reset all ports back to the original defaults (UI: 3000, Server: 3001, Runner: 3002) in the script.
- Ensure any environment variables implemented in `.env` files are included in `hotreload-test.sh` and `production.sh` for consistency.
- Test with the standard ports to avoid CI issues.

This ensures compatibility and prevents port conflicts in production or CI.

**Log Output:**
```
[Server] {"level":30,"time":1770345175510,"msg":"Server listening at http://127.0.0.1:3001"}
[Runner] Using SQLite store: ./runner.db
[UI]     ▲ Next.js 15.5.10 — Local: http://localhost:3000
```

### Development Scripts

```bash
# Install all dependencies
npm run bootstrap

# Initialize environment files
npm run init:env

# Start development servers
npm run dev

# Build all services
npm run build

# Run smoke tests
npm run smoke

# Lint UI code
npm run lint
```

### Toolbox CLI

Developer utilities for common tasks:

```bash
# List files in UI source
npm run toolbox:list

# Search for code patterns
npm run toolbox:grep

# Run safe commands
npm run toolbox -- run-command "ls -la"

# Smoke test toolbox
npm run toolbox:smoke
```

**Security:** The toolbox enforces an allowlist for commands to prevent dangerous operations.

## Production Deployment

### Using Production Script

```bash
./production.sh
```

This script:
- ✅ Installs dependencies
- ✅ Builds all services
- ✅ Sets up environment files
- ✅ Starts production servers
- ✅ Provides access URLs

### Manual Production Setup

```bash
# Build all services
npm run build

# Start production servers
npm run start
```

### Port Configuration

**Development (hotreload-test.sh):**
- UI: 3000 (fallback: 3000-3050)
- Server: 3001 (fallback: 3001-3050)
- Runner: 3002 (fallback: 3002-3050)

**Production:**
- Configure custom ports in environment variables
- Ensure ports are available and not conflicting

## API Documentation

### Server Endpoints

#### Health & Status
- `GET /health` - Service health check

#### Agents
- `GET /agents` - List all agents
- `POST /agents` - Create new agent
- `GET /agents/:id` - Get agent details
- `PUT /agents/:id` - Update agent
- `DELETE /agents/:id` - Delete agent

#### Sessions
- `GET /sessions` - List chat sessions
- `POST /sessions` - Create new session
- `GET /sessions/:id` - Get session details
- `DELETE /sessions/:id` - Delete session

#### Teams
- `GET /teams` - List teams
- `POST /teams` - Create new team
- `GET /teams/:id` - Get team details
- `PUT /teams/:id` - Update team
- `DELETE /teams/:id` - Delete team

#### Runs (Agent Execution)
- `POST /agents/:id/runs` - Execute agent workflow
- `GET /runs/:id` - Get run status

### Runner Endpoints

#### Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs` - Create job
- `GET /api/jobs/:id` - Get job status
- `POST /api/jobs/:id/start` - Start job execution

#### Health
- `GET /health` - Runner health check

### Authentication

Include Bearer token in Authorization header:

```
Authorization: Bearer <your-token>
```

## Project Structure

```
aiwebapp/
├── landing/               # Static landing page for heidi.com.au
│   └── index.html        # Modern landing page with signup/signin
├── server/                 # Backend API server (Port 3001)
│   ├── src/
│   │   ├── index.ts       # Main Fastify server
│   │   ├── routes/        # API route handlers
│   │   │   ├── agents.ts
│   │   │   ├── sessions.ts
│   │   │   ├── teams.ts
│   │   │   ├── runs.ts
│   │   │   └── health.ts
│   │   ├── auth.ts        # Authentication logic
│   │   ├── storage.ts     # SQLite database operations
│   │   └── types.ts       # TypeScript definitions
│   ├── .env              # Server environment
│   ├── package.json
│   └── tsconfig.json
├── ui/                     # Frontend Next.js app (Port 3000)
│   ├── src/
│   │   ├── app/           # Next.js 15 app router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── api/       # API proxy routes
│   │   ├── components/    # React components
│   │   │   ├── chat/      # Chat interface
│   │   │   ├── ui/        # Reusable UI components
│   │   │   └── icons/     # Icon components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities and API clients
│   │   ├── store.ts       # Zustand state management
│   │   └── types/         # Type definitions
│   ├── .env.local        # UI environment
│   ├── next.config.ts
│   ├── package.json
│   └── tailwind.config.ts
├── runner/                 # Agent execution service (Port 3002)
│   ├── src/
│   │   ├── index.ts       # Main runner server
│   │   ├── db.ts          # Job storage and state
│   │   ├── executor.ts    # Agent workflow execution
│   │   ├── agent.ts       # Agent logic
│   │   └── bridge.ts      # VSCode bridge integration
│   ├── .env              # Runner environment
│   ├── runner.db         # SQLite database
│   ├── package.json
│   └── tsconfig.json
├── .dev/                   # Development documentation
│   └── tasks/             # Task tracking
├── .github/
│   └── workflows/         # CI/CD pipelines
├── scripts/               # Development utilities
│   ├── check-tools.js
│   └── toolbox.js
├── config/                # Configuration files
│   └── allowed-commands.json
├── logs/                  # Development logs
├── tmp/                   # Temporary files
├── hotreload-test.sh     # Development startup script
├── production.sh         # Production deployment script
├── setup-tunnel.sh       # ngrok tunnel setup
├── setup-cloudflared-tunnel.sh  # Cloudflare tunnel setup
├── update-env-with-tunnel.sh    # Environment updates
├── update-env-with-cloudflared.sh
├── package.json          # Root package.json
└── README.md
```

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled across all services
- **ESLint + Prettier**: Automated code formatting and linting
- **Conventional Commits**: Structured commit messages
- **Component Architecture**: Modular, reusable React components

### Testing Strategy

```bash
# Server smoke tests
cd server && npm run smoke

# UI type checking
cd ui && npm run typecheck

# UI linting
cd ui && npm run lint

# Full smoke test suite
npm run smoke
```

### Database

- **SQLite**: File-based database with automatic schema management
- **Migrations**: Automatic table creation on startup
- **Persistence**: Configurable data retention

### Security Considerations

- **Command Allowlist**: Runner enforces safe command execution
- **Token Authentication**: Bearer token validation
- **CORS Configuration**: Domain-specific access control
- **Environment Isolation**: Separate configs for dev/prod

## Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check port usage
lsof -i :3000 -i :3001 -i :3002

# Kill conflicting processes
pkill -f "node.*3000"
```

#### Copilot Connection Issues
```bash
# Test bridge connectivity
curl http://localhost:8080/v1/models

# Check UI proxy
curl http://localhost:3000/api/copilot/v1/models
```

#### Database Issues
```bash
# Reset database
rm server/server.db runner/runner.db
# Restart services to recreate tables
```

#### Environment Problems
```bash
# Reinitialize environment
npm run init:env

# Check environment files
ls -la */.env*
```

### Logs and Debugging

```bash
# View service logs
tail -f logs/server.log
tail -f logs/ui.log
tail -f logs/runner.log

# Check service health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

## Contributing

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/aiwebapp.git`
3. Set up development: `./hotreload-test.sh`
4. Create feature branch: `git checkout -b feature/your-feature`
5. Make changes and test
6. Commit with conventional commits
7. Push and create PR

### Pull Request Requirements

- ✅ TypeScript compilation passes
- ✅ ESLint checks pass
- ✅ All smoke tests pass
- ✅ Documentation updated
- ✅ Environment variables documented

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- 📖 **Documentation**: Check `.dev/` folder for detailed guides
- 🐛 **Issues**: Create GitHub issues for bugs and features
- 💬 **Discussions**: Use GitHub discussions for questions
- 📧 **Contact**: heidi@heidiai.com.au

---

**Last Updated**: February 6, 2026
**Version**: 1.0.0

## Updates

### Landing Page
- The landing page is now hosted on port `6868` and accessible at [https://heidiai.com.au](https://heidiai.com.au).
- The landing page includes a modern, responsive design with links to the main AI platform and user registration/login.

### User Registration/Login
- A new service for user registration and login is hosted on port `3006` and accessible at [https://user.heidi.com.au](https://user.heidi.com.au).
- The landing page's "Sign Up" and "Login" buttons redirect users to this service.

### Updated Port Mappings
- **Landing Page**: Port `6868` ([https://heidiai.com.au](https://heidiai.com.au))
- **Main App UI**: Port `3000` ([https://ai.heidi.com.au](https://ai.heidi.com.au))
- **API**: Port `3001` ([https://api.heidi.com.au](https://api.heidi.com.au))
- **Code**: Port `3002` ([https://code.heidi.com.au](https://code.heidi.com.au))
- **User Registration/Login**: Port `3006` ([https://user.heidi.com.au](https://user.heidi.com.au))

### Developer Notification
- Please note that the landing page is now hosted on port `6868`. Update your local configurations and workflows accordingly.
