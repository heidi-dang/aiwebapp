# Heidi Web App

A modern full-stack AI Web App built with Next.js, Fastify, and Node.js. Features user authentication, real-time chat, and a modular architecture with separate services for UI, API, and background processing.

## Websites

- **Main Website**: [https://yourdomain.com](https://yourdomain.com) - Landing page
- **Web App**: [https://app.yourdomain.com](https://app.yourdomain.com) - Main application
- **API**: [https://api.yourdomain.com](https://api.yourdomain.com) - REST API
- **User Registration**: [https://auth.yourdomain.com](https://auth.yourdomain.com) - User signup/login

## Features

- 👤 **User Authentication**: Secure registration and login with OAuth support
- 💬 **Real-time Chat Interface**: Interactive messaging with streaming responses
- 🏃 **Background Processing**: Dedicated service for handling async tasks and workflows
- 📊 **Session Management**: Persistent user sessions and conversation history
- 👥 **Team Collaboration**: Multi-user support with team-based organization
- 🔄 **Live Updates**: Real-time streaming via Server-Sent Events
- 🎨 **Modern UI**: Built with Next.js 15, Tailwind CSS, and shadcn/ui components
- 🗄️ **SQLite Database**: Lightweight, file-based data persistence
- 🔒 **TypeScript**: Full type safety across the entire stack
- 🚀 **Hot Reload Development**: Guided startup scripts with fixed local ports
- 🛠️ **Developer Tools**: CLI utilities for file operations and development
- 🌐 **Production Ready**: Docker support and deployment scripts

## Architecture

This application consists of four main services that communicate via HTTP APIs:

- **Landing** (`/landing`): Simple Node.js server for the marketing website
- **UI** (`/ui`): Next.js web application providing the main user interface
- **Server** (`/server`): Fastify-based API server handling authentication, database operations, and business logic
- **Runner** (`/runner`): Fastify service for executing background tasks and processing workflows

### Data Flow

```
Landing (Port 6868)    UI (Port 4000) ↔ Server (Port 4001) ↔ Runner (Port 4002)
                        ↑
                        └────────────────── User Registration ──────────────────┘
```

### Service URLs and APIs

For tunneling or external access, the following services and endpoints are available:

#### Landing Service (Port 6868)
- **URL**: `http://localhost:6868` (dev) / `https://yourdomain.com` (prod)
- **Purpose**: Marketing website and company information
- **Key Routes**:
  - `/` - Landing page

#### UI Service (Port 4000)
- **URL**: `http://localhost:4000` (dev) / `https://app.yourdomain.com` (prod)
- **Purpose**: Main web application interface
- **Key Routes**:
  - `/` - Main application
  - `/register` - User registration
  - `/login` - User login

#### Server API (Port 4001)
- **URL**: `http://localhost:4001` (dev) / `https://api.yourdomain.com` (prod)
- **Purpose**: REST API for data management and authentication
- **Key Endpoints**:
  - `GET /health` - Health check
  - `GET/POST /api/auth` - Authentication endpoints
  - `GET/POST /api/users` - User management
  - `GET/POST /api/sessions` - Session management

#### Runner Service (Port 4002)
- **URL**: `http://localhost:4002` (dev) / `https://code.yourdomain.com` (prod)
- **Purpose**: Background task processing and workflow execution
- **Key Endpoints**:
  - `GET /health` - Health check
  - `GET/POST /api/jobs` - Job management

## Prerequisites

- **Node.js 20.x or later** (required for all services)
- **npm** or **yarn** package manager
- **Git** for version control

## Environment Configuration

This application uses a single `.env` file in the root directory for all environment variables. The file supports conditional expansion based on the `NODE_ENV` variable.

### Environment Variables

The root `.env` file contains all configuration with development defaults. For production, set `NODE_ENV=production` to use production values.

Key variables:
- `NODE_ENV`: Environment mode (`development` or `production`)
- `PORT`: UI service port (4000)
- `SERVER_PORT`: API server port (4001)
- `RUNNER_PORT`: Runner service port (4002)
- `AUTH_PORT`: Auth service port (4003)
- `LANDING_PORT`: Landing page port (6868)
- `RUNNER_TOKEN`: Authentication token for runner API
- `CORS_ORIGIN`: Allowed CORS origins
- `NEXT_PUBLIC_API_URL`: Public API URL for frontend
- `NEXT_PUBLIC_RUNNER_BASE_URL`: Public runner URL
- `NEXT_PUBLIC_AI_API_URL`: AI API endpoint
- `RUNNER_URL`: Internal runner URL
- `SERVER_PUBLIC_URL`: Public server URL (required for OAuth redirects - set before running production scripts)
- `CLOUDFLARE_TUNNEL_NAME`: Tunnel configuration name

### Validation

Validate environment variables are properly loaded:

```bash
npm run toolbox validate-env
```

## Quick Start

### Development Environment

The easiest way to get started is using the hot reload development script:

#### Windows
```cmd
# Start all services with hot reload
scripts\ops\hotscript-windows.bat
```

#### Linux/Mac
```bash
# Start all services with hot reload
./scripts/ops/hotscript-linux.sh
```

This script will:
- ✅ Install dependencies for all services
- ✅ Configure environment variables automatically
- ✅ Start landing + server + runner + UI services
- ✅ Set up logging and health checks
- ✅ Provide access URLs

**Fixed Ports:**
- Landing: `http://localhost:6868`
- UI: `http://localhost:4000`
- Server: `http://localhost:4001`
- Runner: `http://localhost:4002`

### Registration Page

- **Register URL:** `http://localhost:4000/register`

### Production Deployment

#### Windows
```cmd
# Deploy to production
scripts\ops\production-windows.bat
```

#### Linux/Mac
```bash
# Deploy to production
./scripts/ops/production-linux.sh
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
SERVER_PUBLIC_URL=http://localhost:4001

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

## Docker Deployment

We support deploying the application using Docker containers. This is the recommended method for staging and production environments.

### Building and Pushing Images

Use the provided scripts to build and push Docker images to Docker Hub. These scripts build images for the UI, Server, and Runner services and tag them with `v0.01` and `latest`.

**Prerequisites:**
- Docker installed and running
- Logged into Docker Hub (`docker login`)

**Windows:**
```batch
scripts\ops\build-docker.bat
scripts\ops\push-docker.bat
```

**Linux/macOS:**
```bash
./scripts/ops/build-docker.sh
./scripts/ops/push-docker.sh
```

### Deploying with Docker Compose

For production or test environments, use the `docker-compose.deploy.yml` file which pulls the pre-built images from Docker Hub.

**Deploy v0.01 (Default):**
```bash
docker-compose -f docker-compose.deploy.yml up -d
```

**Deploy a Specific Version:**
You can deploy a specific version by setting the `TAG` environment variable:

```bash
# Deploy latest
TAG=latest docker-compose -f docker-compose.deploy.yml up -d

# Deploy v0.01
TAG=v0.01 docker-compose -f docker-compose.deploy.yml up -d
```

Ensure you have your environment variables configured in `.env` or passed to the docker-compose command.

## CopilotAPI Integration

## Support

For issues or questions, please check the logs in the logs/ directory or refer to the instruction files:
- [Windows Setup](docs/instruction-Windows.md)
- [Linux Setup](docs/instruction-linux.md)
