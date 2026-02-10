import * as vscode from 'vscode';
import { CopilotGatewayServer } from '../server/CopilotGatewayServer';

export class GatewayDashboard {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private server: CopilotGatewayServer | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiwebapp-copilot-gateway-dashboard',
      'AIWebApp Copilot Gateway Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
      }
    );

    this.panel.webview.html = this.getWebviewContent();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.context.subscriptions);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleWebviewMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    // Update dashboard periodically
    this.startDashboardUpdates();
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AIWebApp Copilot Gateway Dashboard</title>
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
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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
            font-size: 32px;
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
          .recent-requests {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
          }
          .request-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
          }
          .request-item:last-child {
            border-bottom: none;
          }
          .request-method {
            font-weight: bold;
            color: var(--vscode-charts-blue);
          }
          .request-time {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>AIWebApp Copilot Gateway Dashboard</h1>
            <div class="status">
              <div class="status-indicator" id="statusIndicator"></div>
              <span id="statusText">Server Stopped</span>
            </div>
            <div class="controls">
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
              <div class="stat-title">Active Requests</div>
              <div class="stat-value" id="activeRequests">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Queue Length</div>
              <div class="stat-value" id="queueLength">0</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Avg Response Time</div>
              <div class="stat-value" id="avgResponseTime">0ms</div>
            </div>
          </div>

          <div class="charts">
            <div class="chart">
              <h3>Requests Over Time</h3>
              <canvas id="requestsChart" width="400" height="250"></canvas>
            </div>
            <div class="chart">
              <h3>Error Rate</h3>
              <canvas id="errorChart" width="400" height="250"></canvas>
            </div>
          </div>

          <div class="recent-requests">
            <h3>Recent Requests</h3>
            <div id="recentRequests">
              <p>No recent requests</p>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // DOM elements
          const statusIndicator = document.getElementById('statusIndicator');
          const statusText = document.getElementById('statusText');
          const startBtn = document.getElementById('startBtn');
          const stopBtn = document.getElementById('stopBtn');
          const settingsBtn = document.getElementById('settingsBtn');
          const totalRequests = document.getElementById('totalRequests');
          const activeRequests = document.getElementById('activeRequests');
          const queueLength = document.getElementById('queueLength');
          const avgResponseTime = document.getElementById('avgResponseTime');
          const recentRequests = document.getElementById('recentRequests');

          // Event listeners
          startBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'startServer' });
          });

          stopBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'stopServer' });
          });

          settingsBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'openSettings' });
          });

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
              case 'updateStats':
                updateStats(message.stats);
                break;
              case 'serverStarted':
                updateServerStatus(true);
                break;
              case 'serverStopped':
                updateServerStatus(false);
                break;
            }
          });

          function updateStats(stats) {
            totalRequests.textContent = stats.totalRequests || 0;
            activeRequests.textContent = stats.activeRequests || 0;
            queueLength.textContent = stats.queueLength || 0;
            avgResponseTime.textContent = Math.round(stats.averageResponseTime || 0) + 'ms';
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

          // Initialize
          updateServerStatus(false);
        </script>
      </body>
      </html>
    `;
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'startServer':
        vscode.commands.executeCommand('aiwebapp-copilot-gateway.startServer');
        break;
      case 'stopServer':
        vscode.commands.executeCommand('aiwebapp-copilot-gateway.stopServer');
        break;
      case 'openSettings':
        vscode.commands.executeCommand('aiwebapp-copilot-gateway.openSettings');
        break;
    }
  }

  private startDashboardUpdates(): void {
    // Update dashboard every 2 seconds
    const updateInterval = setInterval(() => {
      if (this.panel && this.server) {
        const stats = this.server.getStats();
        this.panel.webview.postMessage({
          type: 'updateStats',
          stats
        });
      }
    }, 2000);

    // Clean up interval when panel is disposed
    this.panel?.onDidDispose(() => {
      clearInterval(updateInterval);
    });
  }

  setServer(server: CopilotGatewayServer): void {
    this.server = server;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}