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

export function activate(context: vscode.ExtensionContext) {
    console.log('Heidi AI Copilot Dashboard extension is now active.');

    // Initialize services
    initializeServices(context);

    // Register commands
    registerCommands(context);

    // Auto-start server if configured
    const autoStart = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.server').get('autoStart', true);
    if (autoStart) {
        startServer();
    }

    // Update status bar
    updateStatusBar();
}

export function deactivate() {
    console.log('Heidi AI Copilot Dashboard extension is shutting down.');

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
    const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway');

    // Initialize authentication service
    authService = new AuthService(config.get('apiKey', ''));

    // Initialize session manager
    sessionManager = new SessionManager();

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
        vscode.window.showInformationMessage('Heidi AI Copilot Dashboard is already running.');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway');

        const configObj = {
            port: config.get('server.port', 3030),
            host: config.get('server.host', '127.0.0.1'),
            apiKey: config.get('server.apiKey', ''),
            maxConcurrentRequests: config.get('server.maxConcurrentRequests', 5),
            requestTimeout: config.get('server.requestTimeout', 30000),
            retryAttempts: config.get('server.retryAttempts', 3),
            backendUrl: config.get('backendUrl', 'http://localhost:3000')
        };

        server = new CopilotGatewayServer(configObj, authService, sessionManager, metricsService);

        await server.start();
        vscode.window.showInformationMessage(`Heidi AI Copilot Dashboard started on port ${server.getPort()}`);

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'aiwebapp-copilot-gateway.serverRunning', true);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start Heidi AI Copilot Dashboard: ${message}`);
        console.error('Failed to start Heidi AI Copilot Dashboard:', error);
    }
}

async function stopServer(): Promise<void> {
    if (!server || !server.isRunning()) {
        vscode.window.showInformationMessage('Heidi AI Copilot Dashboard is not running.');
        return;
    }

    try {
        await server.stop();
        vscode.window.showInformationMessage('Heidi AI Copilot Dashboard stopped.');

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'aiwebapp-copilot-gateway.serverRunning', false);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to stop Heidi AI Copilot Dashboard: ${message}`);
        console.error('Failed to stop Heidi AI Copilot Dashboard:', error);
    }
}

function updateStatusBar() {
    // Status bar updates are handled by the individual services
    // This function can be extended for additional status indicators
}