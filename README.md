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