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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const CopilotGatewayServer_1 = require("./server/CopilotGatewayServer");
const GatewayDashboard_1 = require("./ui/GatewayDashboard");
const AuthService_1 = require("./services/AuthService");
const SessionManager_1 = require("./services/SessionManager");
const MetricsService_1 = require("./services/MetricsService");
let server;
let dashboard;
let authService;
let sessionManager;
let metricsService;
async function activate(context) {
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
function deactivate() {
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
function initializeServices(context) {
    // Initialize authentication service
    authService = new AuthService_1.AuthService();
    // Initialize session manager
    sessionManager = new SessionManager_1.SessionManager(context);
    // Initialize metrics service
    metricsService = new MetricsService_1.MetricsService();
    // Initialize dashboard
    dashboard = new GatewayDashboard_1.GatewayDashboard(context);
}
function registerCommands(context) {
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
async function startServer() {
    if (server && server.isRunning()) {
        vscode.window.showInformationMessage('Copilot Gateway Server is already running');
        return;
    }
    try {
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway');
        server = new CopilotGatewayServer_1.CopilotGatewayServer({
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start Copilot Gateway Server: ${message}`);
        console.error('Failed to start server:', error);
    }
}
async function stopServer() {
    if (!server || !server.isRunning()) {
        vscode.window.showInformationMessage('Copilot Gateway Server is not running');
        return;
    }
    try {
        await server.stop();
        vscode.window.showInformationMessage('Copilot Gateway Server stopped');
        // Update context for view visibility
        vscode.commands.executeCommand('setContext', 'aiwebapp-copilot-gateway.serverRunning', false);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to stop Copilot Gateway Server: ${message}`);
        console.error('Failed to stop server:', error);
    }
}
function updateStatusBar() {
    // Status bar updates are handled by the individual services
    // This function can be extended for additional status indicators
}
//# sourceMappingURL=extension.js.map