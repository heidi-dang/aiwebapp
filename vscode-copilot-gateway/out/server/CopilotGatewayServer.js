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
const axios_1 = __importDefault(require("axios"));
const stream_1 = require("stream");
const RequestQueue_1 = require("../utils/RequestQueue");
const CopilotClient_1 = require("../utils/CopilotClient");
const SecretRedactor_1 = require("../utils/SecretRedactor");
class CopilotGatewayServer {
    constructor(config, authService, sessionManager, metricsService, contextService, toolService) {
        this.server = null;
        this.wss = null;
        this.isRunningFlag = false;
        this.startTime = 0;
        this.redactionCount = 0;
        this.config = config;
        this.authService = authService;
        this.sessionManager = sessionManager;
        this.metricsService = metricsService;
        this.contextService = contextService;
        this.toolService = toolService;
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
                    console.log(`heidi-gateway-proxy listening on ${this.config.host}:${this.config.port}`);
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
                    console.log('heidi-gateway-proxy stopped');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    getSessionManager() {
        return this.sessionManager;
    }
    isRunning() {
        return this.isRunningFlag;
    }
    getPort() {
        return this.config.port;
    }
    getHost() {
        return this.config.host;
    }
    getApiKey() {
        return this.config.apiKey;
    }
    async getStats() {
        let totalTokens = 0;
        if (this.metricsService) {
            const metrics = await this.metricsService.getMetrics();
            totalTokens = metrics.totalTokens;
        }
        return {
            uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
            totalRequests: this.requestQueue.getTotalProcessed(),
            activeRequests: this.requestQueue.getActiveCount(),
            queueLength: this.requestQueue.getQueueLength(),
            averageResponseTime: this.requestQueue.getAverageResponseTime(),
            errorRate: this.requestQueue.getErrorRate(),
            totalTokens,
            redactions: this.redactionCount
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
        // Sessions API
        this.app.get('/sessions', async (req, res) => {
            try {
                if (!this.sessionManager) {
                    return res.status(503).json({ error: 'SessionManager not initialized' });
                }
                const sessions = await this.sessionManager.getAllSessions();
                res.json({ sessions });
            }
            catch (_error) {
                res.status(500).json({ error: 'Failed to fetch sessions' });
            }
        });
        this.app.get('/sessions/:sessionId', async (req, res) => {
            try {
                if (!this.sessionManager) {
                    return res.status(503).json({ error: 'SessionManager not initialized' });
                }
                const session = await this.sessionManager.getSession(req.params.sessionId);
                if (!session) {
                    return res.status(404).json({ error: 'Session not found' });
                }
                res.json({ session });
            }
            catch (_error) {
                res.status(500).json({ error: 'Failed to fetch session' });
            }
        });
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
            this.getStats().then(stats => {
                ws.send(JSON.stringify({
                    type: 'stats',
                    data: stats
                }));
            });
        });
        // Broadcast stats every 5 seconds
        setInterval(async () => {
            if (this.wss) {
                const stats = await this.getStats();
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
        const stats = await this.getStats();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            stats
        });
    }
    async handleGetModels(req, res) {
        try {
            // Authenticate request
            const authResult = await this.authenticateRequest(req);
            if (!authResult.success) {
                res.status(authResult.status || 401).json({ error: authResult.error });
                return;
            }
            const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
            const routerMode = String(config.get('router.mode', 'copilot'));
            const upstreamBaseUrl = String(config.get('router.upstreamBaseUrl', '')).trim();
            const upstreamApiKey = String(config.get('router.upstreamApiKey', '')).trim();
            if (routerMode === 'upstream') {
                if (!upstreamBaseUrl) {
                    res.status(500).json({ error: 'Upstream base URL is not configured' });
                    return;
                }
                const base = upstreamBaseUrl.replace(/\/+$/, '');
                const target = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
                const upstream = await fetch(target, {
                    method: 'GET',
                    headers: {
                        ...(upstreamApiKey ? { Authorization: `Bearer ${upstreamApiKey}` } : {})
                    }
                });
                const body = await upstream.text();
                res.status(upstream.status);
                res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
                res.send(body);
                return;
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
        const abortController = new AbortController();
        // Handle client disconnect
        req.on('close', () => {
            abortController.abort();
        });
        try {
            // Authenticate request
            const authResult = await this.authenticateRequest(req);
            if (!authResult.success) {
                res.status(authResult.status || 401).json({ error: authResult.error });
                return;
            }
            const request = req.body;
            console.log(`[Gateway] Handling chat completions for model: ${request.model}`);
            // Validate request
            if (!this.validateChatCompletionRequest(request)) {
                console.warn('[Gateway] Invalid request format');
                res.status(400).json({ error: 'Invalid request format' });
                return;
            }
            const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
            console.log('[Gateway] Config read');
            const routerMode = String(config.get('router.mode', 'copilot'));
            const upstreamBaseUrl = String(config.get('router.upstreamBaseUrl', '')).trim();
            const upstreamApiKey = String(config.get('router.upstreamApiKey', '')).trim();
            const userAgent = String(req.headers['user-agent'] || '');
            const contextOverride = String(req.headers['x-heidi-context'] || '').toLowerCase().trim();
            const contextMode = String(config.get('context.mode', 'auto'));
            const proxyClientProfile = String(config.get('proxy.clientProfile', 'copilot')).toLowerCase().trim();
            const isSmartClient = /(trae|windsurf|continue|roo|roo-code|cline)/i.test(userAgent);
            const smartProfiles = new Set([
                'trae',
                'windsurf',
                'cursor',
                'opencode',
                'continue',
                'roo',
                'roo-code',
                'cline',
                'codex',
                'gemini'
            ]);
            const effectiveIsSmartClient = proxyClientProfile === 'auto'
                ? isSmartClient
                : smartProfiles.has(proxyClientProfile);
            const shouldInjectContext = contextOverride === 'inject' ||
                (contextOverride !== 'none' &&
                    (contextMode === 'always' || (contextMode === 'auto' && !effectiveIsSmartClient)));
            // TEMPORARILY DISABLE COMPLEX INJECTION FOR DEBUGGING
            console.log('[Gateway] Skipping complex injection');
            /*
            if (shouldInjectContext) {
              // ...
            }
            */
            const redactionEnabled = config.get('redaction.enabled', true);
            if (redactionEnabled) {
                try {
                    const redactionRes = (0, SecretRedactor_1.redactMessages)(request.messages);
                    if (redactionRes.redactions > 0)
                        this.redactionCount += redactionRes.redactions;
                    request.messages = redactionRes.value;
                }
                catch (e) {
                    console.error('[Gateway] Redaction failed:', e);
                }
            }
            // Handle session management
            if (this.sessionManager && request.session_id) {
                await this.sessionManager.updateSession(request.session_id, request.messages);
            }
            if (routerMode === 'upstream') {
                if (!upstreamBaseUrl) {
                    res.status(500).json({ error: 'Upstream base URL is not configured' });
                    return;
                }
                const base = upstreamBaseUrl.replace(/\/+$/, '');
                const target = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
                const upstream = await fetch(target, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(upstreamApiKey ? { Authorization: `Bearer ${upstreamApiKey}` } : {})
                    },
                    body: JSON.stringify(request),
                    signal: abortController.signal
                });
                res.status(upstream.status);
                upstream.headers.forEach((value, key) => {
                    if (![
                        'transfer-encoding',
                        'connection',
                        'content-encoding',
                        'content-length'
                    ].includes(key.toLowerCase())) {
                        res.setHeader(key, value);
                    }
                });
                if (upstream.body) {
                    stream_1.Readable.fromWeb(upstream.body).pipe(res);
                }
                else {
                    res.end();
                }
                return;
            }
            // Routing Logic
            if (request.model.startsWith('ollama') || request.model.startsWith('llama') || request.model.startsWith('mistral')) {
                await this.handleOllamaRequest(req, res, abortController.signal);
                return;
            }
            if (request.model === 'runner' || request.model === 'agent' || request.model.startsWith('heidi')) {
                await this.handleRunnerRequest(req, res, abortController.signal);
                return;
            }
            // Handle streaming request
            if (request.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                try {
                    for await (const chunk of this.copilotClient.createStreamingChatCompletion(request, { signal: abortController.signal })) {
                        if (abortController.signal.aborted)
                            break;
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                    if (!abortController.signal.aborted) {
                        res.write('data: [DONE]\n\n');
                    }
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
                            status: abortController.signal.aborted ? 'cancelled' : 'success'
                        });
                    }
                }
                catch (streamError) {
                    if (abortController.signal.aborted) {
                        console.log('Stream aborted by client');
                        return;
                    }
                    console.error('Error in stream:', streamError);
                    const message = streamError instanceof Error ? streamError.message : 'Stream error';
                    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
                    res.end();
                }
                return;
            }
            // Queue the non-streaming request
            const result = await this.requestQueue.add(async () => {
                return await this.copilotClient.createChatCompletion(request, { signal: abortController.signal });
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
            console.error('[Gateway] CRITICAL ERROR in chat completions:', error);
            const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Internal server error';
            if (error instanceof Error && error.stack) {
                console.error('[Gateway] Stack trace:', error.stack);
            }
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
            catch {
                // Handle cases where Buffer lengths differ
                return { success: false, status: 401, error: 'Unauthorized' };
            }
        }
        // Check upstream authentication if enabled
        if (this.authService) {
            const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.auth');
            if (config.get('integrationEnabled', true)) {
                const authToken = req.headers['x-auth-token'];
                if (authToken) {
                    try {
                        const user = await this.authService.validateToken(authToken);
                        req.userId = user.user_id;
                        return { success: true, userId: user.user_id };
                    }
                    catch {
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
        if (!this.toolService) {
            res.json({ tools: [] });
            return;
        }
        const tools = this.toolService.getToolsDefinition();
        res.json({ tools });
    }
    async handleToolCall(req, res) {
        if (!this.toolService) {
            res.status(501).json({ error: 'Tool execution not available' });
            return;
        }
        try {
            // Authenticate request
            const authResult = await this.authenticateRequest(req);
            if (!authResult.success) {
                res.status(authResult.status || 401).json({ error: authResult.error });
                return;
            }
            const { name, arguments: args } = req.body;
            if (!name || !args) {
                res.status(400).json({ error: 'Missing tool name or arguments' });
                return;
            }
            let result;
            switch (name) {
                case 'edit_file':
                    result = await this.toolService.applyWorkspaceEdit(args.filePath, args.content);
                    break;
                case 'apply_file_operations':
                    result = await this.toolService.applyFileOperations(args.operations);
                    break;
                case 'run_command':
                    result = await this.toolService.runTerminalCommand(args.command);
                    break;
                default:
                    res.status(404).json({ error: `Tool ${name} not found` });
                    return;
            }
            res.json(result);
        }
        catch (error) {
            console.error('Error executing tool:', error);
            res.status(500).json({ error: 'Failed to execute tool' });
        }
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
    async handleOllamaRequest(req, res, signal) {
        const request = req.body;
        const ollamaUrl = process.env.OLLAMA_URL || vscode.workspace.getConfiguration('heidi-gateway-proxy').get('ollama.url', 'http://localhost:11434');
        try {
            // Map request to Ollama format
            const ollamaRequest = {
                model: request.model.replace('ollama/', ''), // Remove prefix if present
                messages: request.messages,
                stream: request.stream,
                options: {
                    temperature: request.temperature,
                    // ... map other options
                }
            };
            if (request.stream) {
                const response = await axios_1.default.post(`${ollamaUrl}/api/chat`, ollamaRequest, {
                    responseType: 'stream',
                    signal
                });
                res.setHeader('Content-Type', 'text/event-stream');
                response.data.pipe(res);
            }
            else {
                const response = await axios_1.default.post(`${ollamaUrl}/api/chat`, ollamaRequest, { signal });
                // Map response back to OpenAI format
                const responseData = {
                    id: 'ollama-' + Date.now(),
                    object: 'chat.completion',
                    created: Date.now(),
                    model: request.model,
                    choices: [
                        {
                            index: 0,
                            message: response.data.message,
                            finish_reason: response.data.done ? 'stop' : null
                        }
                    ],
                    usage: {
                        prompt_tokens: response.data.prompt_eval_count || 0,
                        completion_tokens: response.data.eval_count || 0,
                        total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
                    }
                };
                res.json(responseData);
            }
        }
        catch (error) {
            console.error('Ollama request failed:', error);
            res.status(502).json({ error: 'Failed to connect to Ollama' });
        }
    }
    async handleRunnerRequest(req, res, signal) {
        try {
            const runnerUrl = vscode.workspace.getConfiguration('heidi-gateway-proxy').get('runner.url', 'http://localhost:4001');
            // 1. Get Agent
            // For now, just generic fetch or config. 
            // Ideal: allow model='runner:agent-id'
            let agentId = '';
            if (req.body.model.includes(':')) {
                agentId = req.body.model.split(':')[1];
            }
            else {
                const agentsRes = await axios_1.default.get(`${runnerUrl}/agents`);
                if (agentsRes.data && agentsRes.data.length > 0) {
                    agentId = agentsRes.data[0].id;
                }
            }
            if (!agentId) {
                res.status(404).json({ error: 'No runner agent found' });
                return;
            }
            // 2. Build prompt from full conversation context
            const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
            const prompt = messages
                .map((m) => {
                const role = String(m?.role || '').trim() || 'unknown';
                const content = typeof m?.content === 'string' ? m.content : '';
                const toolCalls = Array.isArray(m?.tool_calls) && m.tool_calls.length > 0
                    ? `\n[tool_calls]\n${JSON.stringify(m.tool_calls)}`
                    : '';
                return `[${role}]\n${content}${toolCalls}`.trim();
            })
                .filter(Boolean)
                .join('\n\n');
            if (!prompt.trim()) {
                res.status(400).json({ error: 'No prompt found' });
                return;
            }
            // 3. Start Run
            const runRes = await axios_1.default.post(`${runnerUrl}/agents/${agentId}/runs`, {
                message: prompt
            }, { signal });
            const { jobId } = runRes.data;
            if (!jobId) {
                res.status(500).json({ error: 'Failed to start run' });
                return;
            }
            // 4. Stream Events
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const response = await axios_1.default.get(`${runnerUrl}/api/runs/${jobId}/events`, {
                responseType: 'stream',
                signal
            });
            let assistantText = '';
            let finalized = false;
            let toolExtractionAttempted = false;
            const tryExtractOperations = (value) => {
                if (Array.isArray(value)) {
                    const looksLikeOps = value.every((op) => op && typeof op === 'object' && typeof op.action === 'string' && typeof op.filePath === 'string');
                    return looksLikeOps ? value : null;
                }
                if (!value || typeof value !== 'object')
                    return null;
                if (Array.isArray(value.operations))
                    return value.operations;
                const toolName = String(value.tool || value.name || '').trim();
                if (toolName === 'apply_file_operations' &&
                    value.arguments &&
                    Array.isArray(value.arguments.operations)) {
                    return value.arguments.operations;
                }
                return null;
            };
            const extractJsonCandidates = (text) => {
                const candidates = [];
                const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
                for (const match of text.matchAll(fenceRe)) {
                    const raw = String(match[1] || '').trim();
                    if (raw)
                        candidates.push(raw);
                }
                const lastArrayStart = text.lastIndexOf('[');
                const lastArrayEnd = text.lastIndexOf(']');
                if (lastArrayStart !== -1 && lastArrayEnd > lastArrayStart) {
                    candidates.push(text.slice(lastArrayStart, lastArrayEnd + 1).trim());
                }
                const lastObjStart = text.lastIndexOf('{');
                const lastObjEnd = text.lastIndexOf('}');
                if (lastObjStart !== -1 && lastObjEnd > lastObjStart) {
                    candidates.push(text.slice(lastObjStart, lastObjEnd + 1).trim());
                }
                return candidates;
            };
            const maybeApplyOperationsFromText = async () => {
                if (!this.toolService)
                    return;
                if (toolExtractionAttempted)
                    return;
                toolExtractionAttempted = true;
                const candidates = extractJsonCandidates(assistantText);
                for (const raw of candidates) {
                    try {
                        const parsed = JSON.parse(raw);
                        const ops = tryExtractOperations(parsed);
                        if (!ops)
                            continue;
                        await this.toolService.applyFileOperations(ops);
                        return;
                    }
                    catch {
                        continue;
                    }
                }
            };
            const finalizeStream = () => {
                if (finalized)
                    return;
                finalized = true;
                void maybeApplyOperationsFromText();
                if (!res.writableEnded) {
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
            };
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));
                            // Translate to OpenAI format
                            let content = '';
                            if (event.type === 'token' || event.type === 'model.response') {
                                content = event.content || event.text || '';
                            }
                            else if (event.type === 'tool.output') {
                                // Maybe show tool output?
                                content = `\n[Tool Output: ${event.output}]\n`;
                            }
                            if (content) {
                                if (event.type === 'token' || event.type === 'model.response') {
                                    assistantText += content;
                                }
                                const chunk = {
                                    id: 'run-' + jobId,
                                    object: 'chat.completion.chunk',
                                    created: Date.now(),
                                    model: req.body.model,
                                    choices: [{
                                            index: 0,
                                            delta: { content },
                                            finish_reason: null
                                        }]
                                };
                                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                            }
                            if (event.type === 'done' || event.type === 'error') {
                                finalizeStream();
                            }
                        }
                        catch (_e) {
                            // ignore parse error
                        }
                    }
                }
            });
            response.data.on('end', finalizeStream);
            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                const errorChunk = { error: err.message };
                res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
                finalizeStream();
            });
        }
        catch (error) {
            console.error('Runner request failed:', error);
            res.status(502).json({ error: 'Failed to connect to Runner' });
        }
    }
    handleError(err, req, res, _next) {
        console.error('Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
exports.CopilotGatewayServer = CopilotGatewayServer;
//# sourceMappingURL=CopilotGatewayServer.js.map