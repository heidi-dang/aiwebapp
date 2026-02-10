# AIWebApp Copilot Gateway

A VS Code extension that provides an OpenAI-compatible API gateway for GitHub Copilot, integrated with AIWebApp's authentication, session management, and tool calling capabilities.

## Features

- 🤖 **OpenAI-Compatible API**: Exposes GitHub Copilot through OpenAI-style REST endpoints
- 🔐 **Authentication**: Integrates with AIWebApp's auth service for secure access
- 📝 **Session Management**: Track and manage conversation sessions
- 🛠️ **Tool Calling**: Execute AIWebApp tools from your AI applications
- 📊 **Live Metrics**: WebSocket-based real-time server statistics
- 🌊 **Streaming Support**: Server-Sent Events (SSE) for streaming responses
- 🔒 **Security**: Timing-safe API key validation, helmet, CORS

## Installation

### Option 1: From VSIX File

```bash
code --install-extension aiwebapp-copilot-gateway-1.0.0.vsix
```

### Option 2: From Source

1. Clone the repository
2. Navigate to `vscode-copilot-gateway` directory
3. Install dependencies: `npm install`
4. Compile: `npm run compile`
5. Package: `npx @vscode/vsce package`
6. Install: `code --install-extension aiwebapp-copilot-gateway-1.0.0.vsix`

## Quick Start

### 1. Prerequisites

- **VS Code**: Version 1.85.0 or higher
- **Node.js**: Version 18.0.0 or higher
- **GitHub Copilot**: Active subscription (uses VS Code LM API)
- **AIWebApp Backend** (optional): Running on `localhost:4001` for tool calling

### 2. Server Configuration

The extension auto-starts by default. Configure via VS Code settings:

```json
{
  "aiwebapp-copilot-gateway.server.port": 3030,
  "aiwebapp-copilot-gateway.server.host": "127.0.0.1",
  "aiwebapp-copilot-gateway.server.apiKey": "",
  "aiwebapp-copilot-gateway.server.autoStart": true,
  "aiwebapp-copilot-gateway.backendUrl": "http://localhost:4001"
}
```

### 3. Start the Server

**Auto-start** (default): Extension starts server on activation

**Manual start**: 
- Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Run: `AIWebApp: Start Copilot Gateway Server`

### 4. View Dashboard

- Open Command Palette
- Run: `AIWebApp: Show Gateway Dashboard`

## Usage

### API Endpoints

All endpoints are available at `http://localhost:3030` (default).

#### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "uptime": 12345,
  "version": "1.0.0"
}
```

#### Models
```bash
GET /v1/models
```

Returns available Copilot models.

#### Chat Completions (Streaming)

```bash
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY  # Optional

{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,
  "session_id": "optional-session-id"
}
```

#### Tool Calling

**List Tools:**
```bash
GET /v1/tools
Authorization: Bearer YOUR_API_KEY
```

**Execute Tool:**
```bash
POST /v1/tools/call
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "tool": "tool_name",
  "params": {
    "param1": "value1"
  }
}
```

#### Session Management

**List Sessions:**
```bash
GET /v1/sessions
```

**Create Session:**
```bash
POST /v1/sessions
Content-Type: application/json

{
  "name": "My Session"
}
```

**Delete Session:**
```bash
DELETE /v1/sessions/:sessionId
```

### WebSocket (Live Stats)

Connect to `ws://localhost:3030` for real-time server statistics:

```javascript
const ws = new WebSocket('ws://localhost:3030');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'stats') {
    console.log(data.data);
  }
};

// Send ping
ws.send(JSON.stringify({ type: 'ping' }));
```

### cURL Examples

**Basic Chat Completion:**
```bash
curl -X POST http://localhost:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Write a hello world in Python"}],
    "stream": false
  }'
```

**Streaming Chat:**
```bash
curl -X POST http://localhost:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Count to 10"}],
    "stream": true
  }'
```

**With API Key:**
```bash
curl -X POST http://localhost:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Python Example

```python
import requests

url = "http://localhost:3030/v1/chat/completions"
headers = {"Content-Type": "application/json"}

payload = {
    "model": "gpt-4",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is TypeScript?"}
    ],
    "stream": False,
    "temperature": 0.7
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

### Node.js Example

```javascript
const axios = require('axios');

async function chat(message) {
  const response = await axios.post('http://localhost:3030/v1/chat/completions', {
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }],
    stream: false
  });
  
  return response.data.choices[0].message.content;
}

chat('Explain async/await in JavaScript').then(console.log);
```

## Configuration Reference

### Server Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `server.port` | number | `3030` | HTTP server port |
| `server.host` | string | `127.0.0.1` | Server host binding |
| `server.apiKey` | string | `""` | Optional Bearer token for authentication |
| `server.autoStart` | boolean | `true` | Auto-start server on activation |
| `server.maxConcurrentRequests` | number | `5` | Max concurrent Copilot requests |
| `server.requestTimeout` | number | `30000` | Request timeout (ms) |
| `server.retryAttempts` | number | `3` | Retry attempts for failed requests |

### Backend Integration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `backendUrl` | string | `http://localhost:4001` | AIWebApp backend URL |
| `auth.integrationEnabled` | boolean | `true` | Enable AIWebApp auth integration |
| `auth.serviceUrl` | string | `http://localhost:4003` | Auth service URL |

### Session & Metrics

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `session.trackingEnabled` | boolean | `true` | Enable session tracking |
| `session.maxHistory` | number | `100` | Max messages per session |
| `usage.trackingEnabled` | boolean | `true` | Track API usage |
| `usage.metricsEndpoint` | string | `http://localhost:4001/api/metrics` | Metrics endpoint |

## Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **AIWebApp: Start Copilot Gateway Server** - Start the HTTP/WebSocket server
- **AIWebApp: Stop Copilot Gateway Server** - Stop the server
- **AIWebApp: Show Gateway Dashboard** - Open the web-based dashboard
- **AIWebApp: Open Gateway Settings** - Open extension settings

## Security

### API Key Protection

Set an API key to require Bearer token authentication:

```json
{
  "aiwebapp-copilot-gateway.server.apiKey": "your-secret-key-here"
}
```

Then include in requests:
```bash
Authorization: Bearer your-secret-key-here
```

The extension uses **constant-time comparison** to prevent timing attacks.

### Network Security

- Default binding: `127.0.0.1` (localhost only)
- For LAN access: Change host to `0.0.0.0` (use with API key!)
- Helmet middleware enabled
- CORS configured for allowed origins

## Troubleshooting

### Server Won't Start

1. Check if port `3030` is available:
   ```bash
   netstat -ano | findstr "3030"  # Windows
   lsof -i :3030                   # Linux/Mac
   ```

2. Try a different port in settings:
   ```json
   {
     "aiwebapp-copilot-gateway.server.port": 3031
   }
   ```

3. Check VS Code Output panel:
   - View → Output
   - Select "AIWebApp Copilot Gateway"

### No Models Available

- Ensure GitHub Copilot subscription is active
- Restart VS Code
- Check VS Code LM API access

### Tool Calling Fails

- Verify AIWebApp backend is running on configured `backendUrl`
- Check backend logs for authentication/authorization errors
- Ensure `x-auth-token` header is provided if backend requires auth

### Streaming Not Working

- Ensure `stream: true` in request body
- Use SSE-compatible client (supports `text/event-stream`)
- Check firewall/proxy settings

## Development

### Build from Source

```bash
cd vscode-copilot-gateway
npm install
npm run compile
npm run watch  # Watch mode
```

### Package Extension

```bash
npx @vscode/vsce package
```

### Lint & Test

```bash
npm run lint
npm run test
```

## Architecture

```
VS Code Extension
├── Extension Host (extension.ts)
│   ├── Server Lifecycle Management
│   ├── Command Registration
│   └── Configuration Management
├── Copilot Gateway Server (CopilotGatewayServer.ts)
│   ├── Express HTTP Server
│   ├── WebSocket Server (stats)
│   ├── VS Code LM API Client
│   └── Request Queue
├── Services
│   ├── AuthService (AIWebApp integration)
│   ├── SessionManager (conversation tracking)
│   └── MetricsService (usage analytics)
└── UI
    └── GatewayDashboard (webview panel)
```

## Contributing

Contributions welcome! Please ensure:

- TypeScript compiles without errors
- Lint passes: `npm run lint`
- Extension packages: `npx @vscode/vsce package`

## License

MIT

## Support

For issues or questions:
- GitHub Issues: https://github.com/heidi-dang/aiwebapp/issues
- Discussion: Check repository discussions

## Changelog

### 1.0.0 (Initial Release)

- OpenAI-compatible chat completions API
- GitHub Copilot integration via VS Code LM API
- Streaming support (SSE)
- Session management
- Tool calling integration with AIWebApp
- WebSocket live stats
- Authentication integration
- Metrics tracking
- Web dashboard

## Roadmap

- [ ] Multi-provider support (Azure OpenAI, Anthropic)
- [ ] Rate limiting per user/session
- [ ] Request/response logging
- [ ] Admin dashboard enhancements
- [ ] Webhook support for events
- [ ] Plugin system for custom tools
