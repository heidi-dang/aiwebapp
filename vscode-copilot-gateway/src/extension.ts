import * as vscode from 'vscode';
import { CopilotGatewayServer } from './server/CopilotGatewayServer';
import { GatewayDashboard } from './ui/GatewayDashboard';
import { AuthService } from './services/AuthService';
import { SessionManager } from './services/SessionManager';
import { MetricsService } from './services/MetricsService';

let server: CopilotGatewayServer | undefined;
let dashboard: GatewayDashboard | undefined;
let authService: AuthService | undefined;
let sessionManager: SessionManager | undefined;
let metricsService: MetricsService | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('AIWebApp Copilot Gateway extension is now active!');

    // Initialize services
    initializeServices(context);

    // Register commands
    registerCommands(context);

    // Auto-start server if configured
    const autoStart = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.server').get('autoStart', true);
    if (autoStart) {
        await startServer();
    }

    // Update status bar
    updateStatusBar();
}

export function deactivate() {
    console.log('AIWebApp Copilot Gateway extension is deactivating...');

    if (server) {
        server.stop();
        server = undefined;
    }

    if (dashboard) {
        dashboard.dispose();
        dashboard = undefined;
    }

    if (authService) {
        authService.dispose();
        authService = undefined;
    }

    if (sessionManager) {
        sessionManager.dispose();
        sessionManager = undefined;
    }

    if (metricsService) {
        metricsService.dispose();
        metricsService = undefined;
    }
}

function initializeServices(context: vscode.ExtensionContext) {
    // Initialize authentication service
    authService = new AuthService();

    // Initialize session manager
    sessionManager = new SessionManager(context);

    // Initialize metrics service
    metricsService = new MetricsService();

    // Initialize dashboard
    dashboard = new GatewayDashboard(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    // Start server command
    const startServerCmd = vscode.commands.registerCommand('aiwebapp-copilot-gateway.startServer', async () => {
        await startServer();
        updateStatusBar();
    });

    // Stop server command
    const stopServerCmd = vscode.commands.registerCommand('aiwebapp-copilot-gateway.stopServer', async () => {
        await stopServer();
        updateStatusBar();
    });

    // Show dashboard command
    const showDashboardCmd = vscode.commands.registerCommand('aiwebapp-copilot-gateway.showDashboard', () => {
        if (dashboard) {
            dashboard.show();
        }
    });

    // Open settings command
    const openSettingsCmd = vscode.commands.registerCommand('aiwebapp-copilot-gateway.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'aiwebapp-copilot-gateway');
    });

    context.subscriptions.push(startServerCmd, stopServerCmd, showDashboardCmd, openSettingsCmd);
}

async function startServer(): Promise<void> {
    if (server && server.isRunning()) {
        vscode.window.showInformationMessage('Copilot Gateway Server is already running');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway');

        server = new CopilotGatewayServer({
            port: config.get('server.port', 3030),
            host: config.get('server.host', '127.0.0.1'),
            apiKey: config.get('server.apiKey', ''),
            maxConcurrentRequests: config.get('server.maxConcurrentRequests', 5),
            requestTimeout: config.get('server.requestTimeout', 30000),
            retryAttempts: config.get('server.retryAttempts', 3),
            authService,
            sessionManager,
            metricsService
        });

        if (dashboard) {
            dashboard.setServer(server);
        }

        await server.start();
        vscode.window.showInformationMessage(`Copilot Gateway Server started on port ${server.getPort()}`);

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'aiwebapp-copilot-gateway.serverRunning', true);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start Copilot Gateway Server: ${message}`);
        console.error('Failed to start server:', error);
    }
}

async function stopServer(): Promise<void> {
    if (!server || !server.isRunning()) {
        vscode.window.showInformationMessage('Copilot Gateway Server is not running');
        return;
    }

    try {
        await server.stop();
        vscode.window.showInformationMessage('Copilot Gateway Server stopped');

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'aiwebapp-copilot-gateway.serverRunning', false);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to stop Copilot Gateway Server: ${message}`);
        console.error('Failed to stop server:', error);
    }
}

function updateStatusBar() {
    // Status bar updates are handled by the individual services
    // This function can be extended for additional status indicators
}
