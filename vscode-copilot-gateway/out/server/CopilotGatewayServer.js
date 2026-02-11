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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotGatewayServer = void 0;
const vscode = __importStar(require("vscode"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const crypto = __importStar(require("crypto"));
const ws_1 = require("ws");
const RequestQueue_1 = require("../utils/RequestQueue");
const CopilotClient_1 = require("../utils/CopilotClient");
class CopilotGatewayServer {
    constructor(config, authService, sessionManager, metricsService) {
        this.server = null;
        this.wss = null;
        this.isRunningFlag = false;
        this.startTime = 0;
        this.config = config;
        this.authService = authService;
        this.sessionManager = sessionManager;
        this.metricsService = metricsService;
        this.app = (0, express_1.default)();
        this.requestQueue = new RequestQueue_1.RequestQueue(config.maxConcurrentRequests);
        this.copilotClient = new CopilotClient_1.CopilotClient({
            timeout: config.requestTimeout,
            retryAttempts: config.retryAttempts
        });
        this.setupMiddleware();
        this.setupRoutes();
    }
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.config.port, this.config.host, () => {
                    this.isRunningFlag = true;
                    this.startTime = Date.now();
                    console.log(`AIWebApp Copilot Gateway Server listening on ${this.config.host}:${this.config.port}`);
                    // Setup WebSocket server for real-time updates
                    if (this.server) {
                        this.wss = new ws_1.WebSocketServer({ server: this.server });
                        this.setupWebSocketHandlers();
                    }
                    resolve();
                });
                this.server.on('error', (error) => {
                    console.error('Server error:', error);
                    reject(error);
                });
            }
            catch (error) {
                console.error('Failed to start server:', error);
                reject(error);
            }
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.isRunningFlag = false;
                    this.server = null;
                    if (this.wss) {
                        this.wss.close();
                        this.wss = null;
                    }
                    console.log('AIWebApp Copilot Gateway Server stopped');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    isRunning() {
        return this.isRunningFlag;
    }
    getPort() {
        return this.config.port;
    }
    getStats() {
        return {
            uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
            totalRequests: this.requestQueue.getTotalProcessed(),
            activeRequests: this.requestQueue.getActiveCount(),
            queueLength: this.requestQueue.getQueueLength(),
            averageResponseTime: this.requestQueue.getAverageResponseTime(),
            errorRate: this.requestQueue.getErrorRate()
        };
    }
    setupMiddleware() {
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: false, // Disable CSP for API responses
            crossOriginEmbedderPolicy: false
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: this.getAllowedOrigins(),
            credentials: true
        }));
        // Compression
        this.app.use((0, compression_1.default)());
        // Logging
        this.app.use((0, morgan_1.default)('combined'));
        // Body parsing
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // Request timeout
        this.app.use((req, res, next) => {
            res.setTimeout(this.config.requestTimeout, () => {
                res.status(408).json({ error: 'Request timeout' });
            });
            next();
        });
    }
    setupRoutes() {
        // Health check
        this.app.get('/health', this.handleHealthCheck.bind(this));
        // Models endpoint
        this.app.get('/v1/models', this.handleGetModels.bind(this));
        // Chat completions
        this.app.post('/v1/chat/completions', this.handleChatCompletions.bind(this));
        // Legacy completions (redirect to chat completions)
        this.app.post('/v1/completions', this.handleLegacyCompletions.bind(this));
        // Anthropic Claude compatible endpoint
        this.app.post('/v1/messages', this.handleAnthropicMessages.bind(this));
        // Google Gemini compatible endpoint
        this.app.post('/v1beta/models/:model:generateContent', this.handleGeminiGenerateContent.bind(this));
        // Tool calling endpoints
        this.app.get('/v1/tools', this.handleGetTools.bind(this));
        this.app.post('/v1/tools/call', this.handleToolCall.bind(this));
        // Session management
        this.app.get('/v1/sessions', this.handleGetSessions.bind(this));
        this.app.post('/v1/sessions', this.handleCreateSession.bind(this));
        this.app.delete('/v1/sessions/:sessionId', this.handleDeleteSession.bind(this));
        // Metrics endpoint
        this.app.get('/metrics', this.handleGetMetrics.bind(this));
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
        // Error handler
        this.app.use(this.handleError.bind(this));
    }
    setupWebSocketHandlers() {
        if (!this.wss)
            return;
        this.wss.on('connection', (ws) => {
            console.log('WebSocket client connected');
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleWebSocketMessage(ws, data);
                }
                catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });
            ws.on('close', () => {
                console.log('WebSocket client disconnected');
            });
            // Send initial stats
            ws.send(JSON.stringify({
                type: 'stats',
                data: this.getStats()
            }));
        });
        // Broadcast stats every 5 seconds
        setInterval(() => {
            if (this.wss) {
                const stats = this.getStats();
                this.wss.clients.forEach(client => {
                    if (client.readyState === 1) { // OPEN
                        client.send(JSON.stringify({
                            type: 'stats',
                            data: stats
                        }));
                    }
                });
            }
        }, 5000);
    }
    handleWebSocketMessage(ws, data) {
        // Handle WebSocket messages for real-time features
        switch (data.type) {
            case 'subscribe':
                // Handle subscription requests
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }
    getAllowedOrigins() {
        // Allow localhost for development and configured origins
        const origins = [
            'http://localhost:4000', // UI
            'http://localhost:3000', // Development UI
            'http://127.0.0.1:4000',
            'http://127.0.0.1:3000'
        ];
        // Add production origins if configured
        if (process.env.CORS_ORIGIN) {
            origins.push(process.env.CORS_ORIGIN);
        }
        return origins;
    }
    async handleHealthCheck(req, res) {
        const stats = this.getStats();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            stats
        });
    }
    async handleGetModels(req, res) {
        try {
            // Check authentication if required
            if (this.config.apiKey) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== this.config.apiKey) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
            }
            // Get available models from Copilot
            const models = await this.copilotClient.getAvailableModels();
            const response = {
                object: 'list',
                data: models
            };
            res.json(response);
        }
        catch (error) {
            console.error('Error getting models:', error);
            res.status(500).json({ error: 'Failed to get models' });
        }
    }
    async handleChatCompletions(req, res) {
        const startTime = Date.now();
        try {
            // Authenticate request
            const authResult = await this.authenticateRequest(req);
            if (!authResult.success) {
                res.status(authResult.status || 401).json({ error: authResult.error });
                return;
            }
            const request = req.body;
            // Validate request
            if (!this.validateChatCompletionRequest(request)) {
                res.status(400).json({ error: 'Invalid request format' });
                return;
            }
            // Handle session management
            if (this.sessionManager && request.session_id) {
                await this.sessionManager.updateSession(request.session_id, request.messages);
            }
            // Handle streaming request
            if (request.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                try {
                    for await (const chunk of this.copilotClient.createStreamingChatCompletion(request)) {
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                    res.write('data: [DONE]\n\n');
                    res.end();
                    // Record metrics for successful stream (simplified)
                    if (this.metricsService) {
                        await this.metricsService.recordRequest({
                            timestamp: startTime,
                            user_id: authResult.userId,
                            session_id: request.session_id,
                            model: request.model,
                            tokens_used: 0, // In streaming we'd need to extract this from the last chunk
                            request_duration: Date.now() - startTime,
                            status: 'success'
                        });
                    }
                }
                catch (streamError) {
                    console.error('Error in stream:', streamError);
                    const message = streamError instanceof Error ? streamError.message : 'Stream error';
                    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
                    res.end();
                }
                return;
            }
            // Queue the non-streaming request
            const result = await this.requestQueue.add(async () => {
                return await this.copilotClient.createChatCompletion(request);
            });
            // Record metrics
            if (this.metricsService) {
                await this.metricsService.recordRequest({
                    timestamp: startTime,
                    user_id: authResult.userId,
                    session_id: request.session_id,
                    model: request.model,
                    tokens_used: result.usage?.total_tokens || 0,
                    request_duration: Date.now() - startTime,
                    status: 'success'
                });
            }
            // Add session ID to response if present
            if (request.session_id) {
                result.session_id = request.session_id;
            }
            res.json(result);
        }
        catch (error) {
            console.error('Error in chat completions:', error);
            const message = error instanceof Error ? error.message : 'Internal server error';
            // Record error metrics
            if (this.metricsService) {
                await this.metricsService.recordRequest({
                    timestamp: startTime,
                    user_id: req.userId,
                    session_id: req.body?.session_id,
                    model: req.body?.model || 'unknown',
                    tokens_used: 0,
                    request_duration: Date.now() - startTime,
                    status: 'error',
                    error_type: error instanceof Error ? error.message : 'unknown'
                });
            }
            res.status(500).json({ error: message });
        }
    }
    async authenticateRequest(req) {
        // Check API key if configured
        if (this.config.apiKey) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return { success: false, status: 401, error: 'Unauthorized' };
            }
            const providedKey = authHeader.substring(7);
            try {
                if (!crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(this.config.apiKey))) {
                    return { success: false, status: 401, error: 'Unauthorized' };
                }
            }
            catch (e) {
                // Handle cases where Buffer lengths differ
                return { success: false, status: 401, error: 'Unauthorized' };
            }
        }
        // Check AIWebApp authentication if enabled
        if (this.authService) {
            const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.auth');
            if (config.get('integrationEnabled', true)) {
                const authToken = req.headers['x-auth-token'];
                if (authToken) {
                    try {
                        const user = await this.authService.validateToken(authToken);
                        req.userId = user.user_id;
                        return { success: true, userId: user.user_id };
                    }
                    catch (error) {
                        return { success: false, status: 401, error: 'Invalid auth token' };
                    }
                }
            }
        }
        return { success: true };
    }
    validateChatCompletionRequest(request) {
        return !!(request &&
            request.model &&
            Array.isArray(request.messages) &&
            request.messages.length > 0 &&
            request.messages.every(msg => {
                if (!msg.role) {
                    return false;
                }
                // Assistant messages can have null content if they have tool calls
                if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    return true;
                }
                return typeof msg.content === 'string';
            }));
    }
    // Placeholder implementations for other endpoints
    async handleLegacyCompletions(req, res) {
        res.status(501).json({ error: 'Legacy completions not implemented' });
    }
    async handleAnthropicMessages(req, res) {
        res.status(501).json({ error: 'Anthropic messages not implemented' });
    }
    async handleGeminiGenerateContent(req, res) {
        res.status(501).json({ error: 'Gemini generate content not implemented' });
    }
    async handleGetTools(req, res) {
        res.json({ tools: [] }); // Placeholder
    }
    async handleToolCall(req, res) {
        res.status(501).json({ error: 'Tool calling not implemented' });
    }
    async handleGetSessions(req, res) {
        if (!this.sessionManager) {
            res.status(501).json({ error: 'Session management not available' });
            return;
        }
        const sessions = await this.sessionManager.getAllSessions();
        res.json({ sessions });
    }
    async handleCreateSession(req, res) {
        if (!this.sessionManager) {
            res.status(501).json({ error: 'Session management not available' });
            return;
        }
        const sessionId = await this.sessionManager.createSession();
        res.json({ session_id: sessionId });
    }
    async handleDeleteSession(req, res) {
        if (!this.sessionManager) {
            res.status(404).json({ error: 'Session management not available' });
            return;
        }
        const { sessionId } = req.params;
        await this.sessionManager.deleteSession(sessionId);
        res.json({ success: true });
    }
    async handleGetMetrics(req, res) {
        if (!this.metricsService) {
            res.status(501).json({ error: 'Metrics service not available' });
            return;
        }
        const metrics = await this.metricsService.getMetrics();
        res.json(metrics);
    }
    handleError(err, req, res, _next) {
        console.error('Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
exports.CopilotGatewayServer = CopilotGatewayServer;
//# sourceMappingURL=CopilotGatewayServer.js.map