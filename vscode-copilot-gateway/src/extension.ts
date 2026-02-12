import * as vscode from 'vscode';
import * as crypto from 'crypto';
import axios from 'axios';
import { CopilotGatewayServer } from './server/CopilotGatewayServer';
import { GatewayDashboard } from './ui/GatewayDashboard';
import { AuthService } from './services/AuthService';
import { SessionManager } from './services/SessionManager';
import { MetricsService } from './services/MetricsService';
import { ContextService } from './services/ContextService';

let server: CopilotGatewayServer | undefined;
let dashboard: GatewayDashboard | undefined;
let authService: AuthService | undefined;
let sessionManager: SessionManager | undefined;
let metricsService: MetricsService | undefined;
let contextService: ContextService | undefined;
let serverApiKey: string | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('heidi-gateway-dashboard extension is now active!');

    // Initialize services
    initializeServices(context);

    // Register commands
    registerCommands(context);

    // Auto-start server if configured
    const autoStart = vscode.workspace.getConfiguration('heidi-gateway-proxy').get('server.autoStart', true);
    if (autoStart) {
        await startServer();
    }

    // Update status bar
    updateStatusBar();
}

export function deactivate() {
    console.log('heidi-gateway-dashboard extension is deactivating...');

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

    if (contextService) {
        // contextService.dispose(); // No dispose needed currently
        contextService = undefined;
    }
}

function initializeServices(context: vscode.ExtensionContext) {
    // Initialize authentication service
    authService = new AuthService();

    // Initialize session manager
    sessionManager = new SessionManager(context);

    // Initialize metrics service
    metricsService = new MetricsService();

    // Initialize context service
    contextService = new ContextService();

    // Initialize dashboard
    dashboard = new GatewayDashboard(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    // Start server command
    const startServerCmd = vscode.commands.registerCommand('heidi-gateway-dashboard.startServer', async () => {
        await startServer();
        updateStatusBar();
    });

    // Stop server command
    const stopServerCmd = vscode.commands.registerCommand('heidi-gateway-dashboard.stopServer', async () => {
        await stopServer();
        updateStatusBar();
    });

    // Show dashboard command
    const showDashboardCmd = vscode.commands.registerCommand('heidi-gateway-dashboard.showDashboard', () => {
        if (dashboard) {
            dashboard.show();
        }
    });

    // Open settings command
    const openSettingsCmd = vscode.commands.registerCommand('heidi-gateway-dashboard.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'heidi-gateway-proxy');
    });

    const explainSelectionCmd = vscode.commands.registerCommand(
        'heidi-gateway-dashboard.explainSelection',
        async () => {
            await runQuickAction('explain');
        }
    );

    const testSelectionCmd = vscode.commands.registerCommand(
        'heidi-gateway-dashboard.testSelection',
        async () => {
            await runQuickAction('test');
        }
    );

    const refactorSelectionCmd = vscode.commands.registerCommand(
        'heidi-gateway-dashboard.refactorSelection',
        async () => {
            await runQuickAction('refactor');
        }
    );

    context.subscriptions.push(
        startServerCmd,
        stopServerCmd,
        showDashboardCmd,
        openSettingsCmd,
        explainSelectionCmd,
        testSelectionCmd,
        refactorSelectionCmd
    );
}

async function runQuickAction(action: 'explain' | 'test' | 'refactor'): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText || selectedText.trim().length === 0) {
        vscode.window.showErrorMessage('Select some code first');
        return;
    }

    if (!server || !server.isRunning()) {
        await startServer();
    }
    if (!server || !server.isRunning()) {
        vscode.window.showErrorMessage('Gateway server is not running');
        return;
    }

    const fileName = editor.document.fileName;
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    const instruction =
        action === 'explain'
            ? 'Explain what this code does, including key assumptions and edge cases.'
            : action === 'test'
                ? 'Write unit tests for this code. Prefer the repository test framework and include clear test cases.'
                : 'Refactor this code for readability and maintainability without changing behavior.';

    const prompt =
        `${instruction}\n\n` +
        `[File]: ${fileName}\n` +
        `[Selection]: lines ${startLine}-${endLine}\n\n` +
        '```ts\n' +
        selectedText +
        '\n```\n';

    const url = `http://${server.getHost()}:${server.getPort()}/v1/chat/completions`;
    const apiKey = serverApiKey || server.getApiKey();

    try {
        const response = await axios.post(
            url,
            {
                model: 'auto',
                messages: [{ role: 'user', content: prompt }],
                stream: false
            },
            {
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
                timeout: 60000
            }
        );

        const content =
            response.data?.choices?.[0]?.message?.content ??
            response.data?.choices?.[0]?.text ??
            '';

        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: String(content || 'No response')
        });
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
        const message =
            axios.isAxiosError(error)
                ? (error.response?.data?.error ?? error.message)
                : (error instanceof Error ? error.message : String(error));
        vscode.window.showErrorMessage(`Quick action failed: ${message}`);
    }
}

async function startServer(): Promise<void> {
    if (server && server.isRunning()) {
        vscode.window.showInformationMessage('heidi-gateway-proxy is already running');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
        
        // Generate a random API key for this session if one isn't configured
        const configuredKey = config.get('server.apiKey', '');
        const sessionApiKey = configuredKey || crypto.randomBytes(32).toString('hex');
        serverApiKey = sessionApiKey;

        server = new CopilotGatewayServer(
            {
                port: config.get('server.port', 3030),
                host: config.get('server.host', '127.0.0.1'),
                apiKey: sessionApiKey,
                maxConcurrentRequests: config.get('server.maxConcurrentRequests', 5),
                requestTimeout: config.get('server.requestTimeout', 30000),
                retryAttempts: config.get('server.retryAttempts', 3)
            },
            authService,
            sessionManager,
            metricsService,
            contextService
        );

        if (dashboard) {
            dashboard.setServer(server);
        }

        await server.start();
        vscode.window.showInformationMessage(`heidi-gateway-proxy started on port ${server.getPort()}`);
        
        // Store API key in context/secret storage for other components to use if needed
        // For now, we print it to output channel or logs if needed, but primarily it's for internal protection
        // against malware scanning localhost. 
        // We will also pass it to the dashboard if it needs to make authenticated requests.

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'heidi-gateway-proxy.serverRunning', true);

        // Notify dashboard of server start and pass the key (so it can talk to the server)
        if (dashboard && dashboard.getPanel()) {
            dashboard.getPanel()!.webview.postMessage({
                type: 'serverStarted',
                apiKey: sessionApiKey
            });
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start heidi-gateway-proxy: ${message}`);
        console.error('Failed to start server:', error);
    }
}

async function stopServer(): Promise<void> {
    if (!server || !server.isRunning()) {
        vscode.window.showInformationMessage('heidi-gateway-proxy is not running');
        return;
    }

    try {
        await server.stop();
        vscode.window.showInformationMessage('heidi-gateway-proxy stopped');

        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'heidi-gateway-proxy.serverRunning', false);

        // Notify dashboard of server stop
        if (dashboard && dashboard.getPanel()) {
            dashboard.getPanel()!.webview.postMessage({
                type: 'serverStopped'
            });
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to stop heidi-gateway-proxy: ${message}`);
        console.error('Failed to stop server:', error);
    }
}

function updateStatusBar() {
    // Status bar updates are handled by the individual services
    // This function can be extended for additional status indicators
}
