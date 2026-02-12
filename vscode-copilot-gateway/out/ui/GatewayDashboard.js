"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayDashboard = void 0;
const vscode = __importStar(require("vscode"));
class GatewayDashboard {
    constructor(context) {
        this.context = context;
    }
    getPanel() {
        return this.panel;
    }
    setServer(server) {
        this.server = server;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('heidi-gateway-dashboard', 'heidi-gateway-dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);
        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleWebviewMessage(message);
        }, undefined, this.context.subscriptions);
        // Update dashboard periodically
        this.startDashboardUpdates();
    }
    getWebviewContent() {
        const activeAgent = this.context.globalState.get('activeAgent') || 'copilot';
        const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
        const proxyClient = String(config.get('proxy.clientProfile', 'copilot'));
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>heidi-gateway-dashboard</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
          }
          .status {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: var(--vscode-errorForeground);
          }
          .status-indicator.running {
            background-color: var(--vscode-charts-green);
          }
          .controls {
            display: flex;
            gap: 10px;
            align-items: center;
          }
          button, select {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
            font-family: inherit;
          }
          button:hover, select:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          select {
            padding-right: 32px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .stat-card {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
          }
          .stat-title {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: var(--vscode-editor-foreground);
          }
          .charts {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          .chart {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            height: 300px;
          }
          .section {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .session-list {
            max-height: 300px;
            overflow-y: auto;
          }
          .session-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
          }
          .session-item:last-child {
            border-bottom: none;
          }
          .session-id {
            font-family: monospace;
            color: var(--vscode-textPreformat-foreground);
          }
          .transcript-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            background-color: var(--vscode-editor-background);
            height: 500px;
            overflow-y: auto;
            padding: 20px;
            margin-top: 20px;
            display: none; /* Hidden by default */
          }
          .transcript-container.visible {
            display: block;
          }
          .message {
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .message.user {
            align-items: flex-end;
          }
          .message.assistant {
            align-items: flex-start;
          }
          .bubble {
            padding: 8px 12px;
            border-radius: 6px;
            max-width: 80%;
            word-wrap: break-word;
          }
          .message.user .bubble {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .message.assistant .bubble {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-editor-foreground);
            border: 1px solid var(--vscode-widget-border);
          }
          .role-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 2px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1>heidi-gateway-proxy</h1>
              <div class="status">
                <div class="status-indicator" id="statusIndicator"></div>
                <span id="statusText">Server Stopped</span>
              </div>
            </div>
            <div class="controls">
              <select id="proxyClientSelector" title="Controls context injection behavior for different clients">
                <option value="copilot" ${proxyClient === 'copilot' ? 'selected' : ''}>Proxy To: Copilot (Default)</option>
                <option value="codex" ${proxyClient === 'codex' ? 'selected' : ''}>Proxy To: Codex</option>
                <option value="gemini" ${proxyClient === 'gemini' ? 'selected' : ''}>Proxy To: Gemini</option>
                <option value="trae" ${proxyClient === 'trae' ? 'selected' : ''}>Proxy To: Trae</option>
                <option value="windsurf" ${proxyClient === 'windsurf' ? 'selected' : ''}>Proxy To: Windsurf</option>
                <option value="cursor" ${proxyClient === 'cursor' ? 'selected' : ''}>Proxy To: Cursor</option>
                <option value="opencode" ${proxyClient === 'opencode' ? 'selected' : ''}>Proxy To: OpenCode</option>
                <option value="continue" ${proxyClient === 'continue' ? 'selected' : ''}>Proxy To: Continue.dev</option>
                <option value="roo-code" ${proxyClient === 'roo-code' ? 'selected' : ''}>Proxy To: Roo Code (Cline)</option>
                <option value="auto" ${proxyClient === 'auto' ? 'selected' : ''}>Proxy To: Auto (Detect)</option>
              </select>
              <select id="agentSelector">
                <option value="copilot" ${activeAgent === 'copilot' ? 'selected' : ''}>GitHub Copilot (Default)</option>
                <option value="ollama" ${activeAgent === 'ollama' ? 'selected' : ''}>Ollama (Local)</option>
                <option value="runner" ${activeAgent === 'runner' ? 'selected' : ''}>Heidi Runner (Local)</option>
              </select>
              <button id="startBtn">Start Server</button>
              <button id="stopBtn">Stop Server</button>
              <button id="settingsBtn">Settings</button>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-title">Total Requests</div>
              <div class="stat-value" id="totalRequests">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Token Usage</div>
              <div class="stat-value" id="totalTokens">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Queue Length</div>
              <div class="stat-value" id="queueLength">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Avg Latency</div>
              <div class="stat-value" id="avgResponseTime">0ms</div>
            </div>
          </div>

          <div class="section">
            <div class="header" style="justify-content: flex-start; gap: 10px; margin-bottom: 10px; border: none; padding: 0;">
              <h3>Recent Sessions</h3>
              <button id="refreshSessionsBtn" style="padding: 4px 8px; font-size: 12px;">Refresh</button>
            </div>
            <div id="sessionList" class="session-list">
              <p>Loading sessions...</p>
            </div>
          </div>
          
          <div id="transcriptView" class="transcript-container">
            <div class="header" style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--vscode-widget-border);">
              <h3 id="transcriptTitle" style="margin: 0;">Session Transcript</h3>
              <button onclick="closeTranscript()" style="padding: 4px 8px; font-size: 12px;">Close</button>
            </div>
            <div id="transcriptContent"></div>
          </div>

          <!-- Charts placeholder (requires Chart.js or similar, simplistic for now) -->
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // Elements
          const statusIndicator = document.getElementById('statusIndicator');
          const statusText = document.getElementById('statusText');
          const startBtn = document.getElementById('startBtn');
          const stopBtn = document.getElementById('stopBtn');
          const settingsBtn = document.getElementById('settingsBtn');
          const agentSelector = document.getElementById('agentSelector');
          const proxyClientSelector = document.getElementById('proxyClientSelector');
          
          // Stats
          const totalRequests = document.getElementById('totalRequests');
          const totalTokens = document.getElementById('totalTokens');
          const queueLength = document.getElementById('queueLength');
          const avgResponseTime = document.getElementById('avgResponseTime');
          const sessionList = document.getElementById('sessionList');
          const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');

          // Bindings
          startBtn.addEventListener('click', () => vscode.postMessage({ command: 'startServer' }));
          stopBtn.addEventListener('click', () => vscode.postMessage({ command: 'stopServer' }));
          settingsBtn.addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));
          
          agentSelector.addEventListener('change', (e) => {
            vscode.postMessage({ command: 'switchAgent', agent: e.target.value });
          });

          proxyClientSelector.addEventListener('change', (e) => {
            vscode.postMessage({ command: 'setProxyClient', client: e.target.value });
          });
          
          refreshSessionsBtn.addEventListener('click', () => {
             vscode.postMessage({ command: 'fetchSessions' });
          });

          // Load sessions initially
          setTimeout(() => vscode.postMessage({ command: 'fetchSessions' }), 1000);

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'updateStats':
                updateStats(message.stats);
                break;
              case 'updateSessions':
                updateSessions(message.sessions);
                break;
              case 'serverStarted':
                updateServerStatus(true);
                break;
              case 'serverStopped':
                updateServerStatus(false);
                break;
              case 'showSessionTranscript':
                renderTranscript(message.session);
                break;
            }
          });

          function updateStats(stats) {
            totalRequests.textContent = stats.totalRequests || 0;
            totalTokens.textContent = stats.totalTokens ? stats.totalTokens.toLocaleString() : 0;
            queueLength.textContent = stats.queueLength || 0;
            avgResponseTime.textContent = Math.round(stats.averageResponseTime || 0) + 'ms';
          }

          function updateSessions(sessions) {
            if (!sessions || sessions.length === 0) {
              sessionList.innerHTML = '<p>No active sessions</p>';
              return;
            }
            
            sessionList.innerHTML = sessions.slice(0, 10).map(s => \`
              <div class="session-item" onclick="loadSession('\${s.id}')" style="cursor: pointer;">
                <div>
                  <div class="session-id">\${s.session_name || s.id}</div>
                  <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">\${new Date(s.updated_at).toLocaleString()}</div>
                </div>
                <div style="font-size: 12px;">\${s.messages ? s.messages.length : 0} msgs</div>
              </div>
            \`).join('');
          }
          
          window.loadSession = (sessionId) => {
             vscode.postMessage({ command: 'loadSession', sessionId });
          };
          
          window.closeTranscript = () => {
             document.getElementById('transcriptView').classList.remove('visible');
          };

          function renderTranscript(session) {
            const container = document.getElementById('transcriptView');
            const content = document.getElementById('transcriptContent');
            const title = document.getElementById('transcriptTitle');
            
            title.textContent = \`Session: \${session.id}\`;
            container.classList.add('visible');
            
            if (!session.messages || session.messages.length === 0) {
              content.innerHTML = '<p>No messages in this session.</p>';
              return;
            }

            content.innerHTML = session.messages.map(msg => \`
              <div class="message \${msg.role}">
                <div class="role-label">\${msg.role}</div>
                <div class="bubble">\${escapeHtml(msg.content)}</div>
              </div>
            \`).join('');
          }

          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/\\n/g, '<br/>');
          }

          function updateServerStatus(running) {
            if (running) {
              statusIndicator.classList.add('running');
              statusText.textContent = 'Server Running';
              startBtn.disabled = true;
              stopBtn.disabled = false;
            } else {
              statusIndicator.classList.remove('running');
              statusText.textContent = 'Server Stopped';
              startBtn.disabled = false;
              stopBtn.disabled = true;
            }
          }
          
          // Initial state
          updateServerStatus(false);
        </script>
      </body>
      </html>
    `;
    }
    async handleWebviewMessage(message) {
        switch (message.command) {
            case 'startServer':
                vscode.commands.executeCommand('heidi-gateway-dashboard.startServer');
                break;
            case 'stopServer':
                vscode.commands.executeCommand('heidi-gateway-dashboard.stopServer');
                break;
            case 'openSettings':
                vscode.commands.executeCommand('heidi-gateway-dashboard.openSettings');
                break;
            case 'switchAgent':
                await this.context.globalState.update('activeAgent', message.agent);
                vscode.window.showInformationMessage(`Active agent switched to ${message.agent}`);
                // Optionally update VS Code config 'heidi-gateway-proxy.model.default' or similar
                // if the server reads it dynamically.
                break;
            case 'setProxyClient': {
                const value = String(message.client || 'copilot');
                const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
                await config.update('proxy.clientProfile', value, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Proxy client profile set to ${value}`);
                break;
            }
            case 'fetchSessions':
                if (this.server && this.server.getSessionManager()) {
                    const sessions = await this.server.getSessionManager().getAllSessions();
                    // Sort by updated_at desc
                    sessions.sort((a, b) => b.updated_at - a.updated_at);
                    this.panel?.webview.postMessage({ type: 'updateSessions', sessions });
                }
                break;
            case 'loadSession':
                if (this.server && this.server.getSessionManager()) {
                    const session = await this.server.getSessionManager().getSession(message.sessionId);
                    if (session) {
                        this.panel?.webview.postMessage({ type: 'showSessionTranscript', session });
                    }
                    else {
                        vscode.window.showErrorMessage(`Session ${message.sessionId} not found.`);
                    }
                }
                break;
        }
    }
    startDashboardUpdates() {
        const updateInterval = setInterval(async () => {
            if (this.panel && this.panel.visible) {
                await this.updateServerHealth();
                if (this.server && this.server.isRunning()) {
                    const stats = await this.server.getStats();
                    this.panel.webview.postMessage({
                        type: 'updateStats',
                        stats
                    });
                    // Also fetch sessions occasionally? Or adds overhead.
                    // Let's do it if sessionManager is available.
                    // We need a way to get sessions from server.
                    // Assuming server has public accessor (I didn't add it yet, but API has handleGetSessions)
                    // I'll skip fetching sessions for now to avoid breaking build if method missing.
                    // But I can use the API endpoint!
                    // Actually, I can add a method to server to get session manager.
                    // Or just leave it as is for now.
                }
            }
        }, 2000);
        this.panel?.onDidDispose(() => {
            clearInterval(updateInterval);
        });
    }
    async updateServerHealth() {
        // ... logic matches previous ...
        if (!this.panel || !this.server) {
            this.panel?.webview.postMessage({ type: 'serverStopped' });
            return;
        }
        // Quick check without full HTTP request if possible, but HTTP is safer for 'health'
        try {
            if (this.server.isRunning()) {
                this.panel.webview.postMessage({ type: 'serverStarted' });
            }
            else {
                this.panel.webview.postMessage({ type: 'serverStopped' });
            }
        }
        catch {
            this.panel.webview.postMessage({ type: 'serverStopped' });
        }
    }
    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
exports.GatewayDashboard = GatewayDashboard;
//# sourceMappingURL=GatewayDashboard.js.map