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
      'heidiAiCopilotDashboard',
      'Heidi AI Copilot Dashboard',
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

    this.panel.webview.onDidReceiveMessage(
      this.handleWebviewMessage.bind(this),
      undefined,
      this.context.subscriptions
    );

    this.startDashboardUpdates();
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Heidi AI Copilot Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .status { margin: 10px 0; }
          .running { color: green; }
          button { margin: 5px; padding: 10px; }
        </style>
      </head>
      <body>
        <h1>Heidi AI Copilot Dashboard</h1>
        <div class="status">
          <span id="status">Server Stopped</span>
        </div>
        <button id="startBtn">Start Server</button>
        <button id="stopBtn">Stop Server</button>
        <div id="stats"></div>
        <script>
          const vscode = acquireVsCodeApi();
          const status = document.getElementById('status');
          const startBtn = document.getElementById('startBtn');
          const stopBtn = document.getElementById('stopBtn');
          const statsDiv = document.getElementById('stats');

          startBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'startServer' });
          });

          stopBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'stopServer' });
          });

          function updateStatus(running) {
            if (running) {
              status.textContent = 'Server Running';
              status.classList.add('running');
              startBtn.disabled = true;
              stopBtn.disabled = false;
            } else {
              status.textContent = 'Server Stopped';
              status.classList.remove('running');
              startBtn.disabled = false;
              stopBtn.disabled = true;
            }
          }

          updateStatus(false);
        </script>
      </body>
      </html>
    `;
  }

  private handleWebviewMessage(message: any): void {
    switch (message.command) {
      case 'startServer':
        vscode.commands.executeCommand('aiwebapp-copilot-gateway.startServer');
        break;
      case 'stopServer':
        vscode.commands.executeCommand('aiwebapp-copilot-gateway.stopServer');
        break;
    }
  }

  private startDashboardUpdates(): void {
    // Update stats periodically
    setInterval(() => {
      if (this.server) {
        const stats = this.server.getStats();
        this.panel?.webview.postMessage({ command: 'updateStats', stats });
      }
    }, 5000);
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