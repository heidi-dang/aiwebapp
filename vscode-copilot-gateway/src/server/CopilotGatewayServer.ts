import * as vscode from 'vscode';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as crypto from 'crypto';
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import {
  ServerConfig,
  ChatCompletionRequest,
  ModelsResponse,
  ServerStats,
  WebSocketMessage
} from '../types';
import { AuthService } from '../services/AuthService';
import { SessionManager } from '../services/SessionManager';
import { MetricsService } from '../services/MetricsService';
import { RequestQueue } from '../utils/RequestQueue';
import { CopilotClient } from '../utils/CopilotClient';

export class CopilotGatewayServer {
  private app: express.Application;
  private server: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private config: ServerConfig;
  private isRunningFlag = false;
  private startTime = 0;

  private authService?: AuthService;
  private sessionManager?: SessionManager;
  private metricsService?: MetricsService;
  private requestQueue: RequestQueue;
  private copilotClient: CopilotClient;

  constructor(
    config: ServerConfig,
    authService?: AuthService,
    sessionManager?: SessionManager,
    metricsService?: MetricsService
  ) {
    this.config = config;
    this.authService = authService;
    this.sessionManager = sessionManager;
    this.metricsService = metricsService;

    this.app = express();
    this.requestQueue = new RequestQueue(config.maxConcurrentRequests);
    this.copilotClient = new CopilotClient({
      timeout: config.requestTimeout,
      retryAttempts: config.retryAttempts
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.isRunningFlag = true;
          this.startTime = Date.now();
          console.log(`AIWebApp Copilot Gateway Server listening on ${this.config.host}:${this.config.port}`);

          // Setup WebSocket server for real-time updates
          if (this.server) {
            this.wss = new WebSocketServer({ server: this.server });
            this.setupWebSocketHandlers();
          }

          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Server error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
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
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  getPort(): number {
    return this.config.port;
  }

  getStats(): ServerStats {
    return {
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      totalRequests: this.requestQueue.getTotalProcessed(),
      activeRequests: this.requestQueue.getActiveCount(),
      queueLength: this.requestQueue.getQueueLength(),
      averageResponseTime: this.requestQueue.getAverageResponseTime(),
      errorRate: this.requestQueue.getErrorRate()
    };
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for API responses
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined'));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request timeout
    this.app.use((req, res, next) => {
      res.setTimeout(this.config.requestTimeout, () => {
        res.status(408).json({ error: 'Request timeout' });
      });
      next();
    });
  }

  private setupRoutes(): void {
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

  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
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

  private handleWebSocketMessage(ws: WebSocket, data: WebSocketMessage): void {
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

  private getAllowedOrigins(): string[] {
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

  private async handleHealthCheck(req: express.Request, res: express.Response): Promise<void> {
    const stats = this.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      stats
    });
  }

  private async handleGetModels(req: express.Request, res: express.Response): Promise<void> {
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

      const response: ModelsResponse = {
        object: 'list',
        data: models
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting models:', error);
      res.status(500).json({ error: 'Failed to get models' });
    }
  }

  private async handleChatCompletions(req: express.Request, res: express.Response): Promise<void> {
    const startTime = Date.now();

    try {
      // Authenticate request
      const authResult = await this.authenticateRequest(req);
      if (!authResult.success) {
        res.status(authResult.status || 401).json({ error: authResult.error });
        return;
      }

      const request: ChatCompletionRequest = req.body;

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
        } catch (streamError) {
          console.error('Error in stream:', streamError);
          res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
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

    } catch (error) {
      console.error('Error in chat completions:', error);

      // Record error metrics
      if (this.metricsService) {
        await this.metricsService.recordRequest({
          timestamp: startTime,
          user_id: (req as { userId?: string }).userId,
          session_id: req.body?.session_id,
          model: req.body?.model || 'unknown',
          tokens_used: 0,
          request_duration: Date.now() - startTime,
          status: 'error',
          error_type: error instanceof Error ? error.message : 'unknown'
        });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async authenticateRequest(req: express.Request): Promise<{
    success: boolean;
    userId?: string;
    status?: number;
    error?: string;
  }> {
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
      } catch {
        // Handle cases where Buffer lengths differ
        return { success: false, status: 401, error: 'Unauthorized' };
      }
    }

    // Check AIWebApp authentication if enabled
    if (this.authService) {
      const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.auth');
      if (config.get('integrationEnabled', true)) {
        const authToken = req.headers['x-auth-token'] as string;
        if (authToken) {
          try {
            const user = await this.authService.validateToken(authToken);
            (req as { userId?: string }).userId = user.user_id;
            return { success: true, userId: user.user_id };
          } catch {
            return { success: false, status: 401, error: 'Invalid auth token' };
          }
        }
      }
    }

    return { success: true };
  }

  private validateChatCompletionRequest(request: ChatCompletionRequest): boolean {
    return !!(
      request &&
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
      })
    );
  }

  // Placeholder implementations for other endpoints
  private async handleLegacyCompletions(req: express.Request, res: express.Response): Promise<void> {
    res.status(501).json({ error: 'Legacy completions not implemented' });
  }

  private async handleAnthropicMessages(req: express.Request, res: express.Response): Promise<void> {
    res.status(501).json({ error: 'Anthropic messages not implemented' });
  }

  private async handleGeminiGenerateContent(req: express.Request, res: express.Response): Promise<void> {
    res.status(501).json({ error: 'Gemini generate content not implemented' });
  }

  private async handleGetTools(req: express.Request, res: express.Response): Promise<void> {
    res.json({ tools: [] }); // Placeholder
  }

  private async handleToolCall(req: express.Request, res: express.Response): Promise<void> {
    res.status(501).json({ error: 'Tool calling not implemented' });
  }

  private async handleGetSessions(req: express.Request, res: express.Response): Promise<void> {
    if (!this.sessionManager) {
      res.status(501).json({ error: 'Session management not available' });
      return;
    }

    const sessions = await this.sessionManager.getAllSessions();
    res.json({ sessions });
  }

  private async handleCreateSession(req: express.Request, res: express.Response): Promise<void> {
    if (!this.sessionManager) {
      res.status(501).json({ error: 'Session management not available' });
      return;
    }

    const sessionId = await this.sessionManager.createSession();
    res.json({ session_id: sessionId });
  }

  private async handleDeleteSession(req: express.Request, res: express.Response): Promise<void> {
    if (!this.sessionManager) {
      res.status(404).json({ error: 'Session management not available' });
      return;
    }

    const { sessionId } = req.params;
    await this.sessionManager.deleteSession(sessionId);
    res.json({ success: true });
  }

  private async handleGetMetrics(req: express.Request, res: express.Response): Promise<void> {
    if (!this.metricsService) {
      res.status(501).json({ error: 'Metrics service not available' });
      return;
    }

    const metrics = await this.metricsService.getMetrics();
    res.json(metrics);
  }

  private handleError(err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction): void {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
