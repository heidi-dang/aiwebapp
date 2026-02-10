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
exports.MetricsService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class MetricsService {
    constructor() {
        this.metrics = [];
        this.maxMetrics = 1000;
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.usage');
        this.metricsEndpoint = config.get('metricsEndpoint', 'http://localhost:4001/api/metrics');
    }
    async recordRequest(data) {
        const metric = {
            ...data,
            timestamp: Date.now()
        };
        this.metrics.push(metric);
        // Keep only the most recent metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
        // Send to metrics endpoint if configured
        if (this.isMetricsEnabled()) {
            try {
                await axios_1.default.post(this.metricsEndpoint, metric, {
                    timeout: 2000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
            catch (error) {
                console.warn('Failed to send metrics to endpoint:', error);
                // Don't throw - metrics failure shouldn't break the API
            }
        }
    }
    async getMetrics(timeRange) {
        let filteredMetrics = this.metrics;
        if (timeRange) {
            filteredMetrics = this.metrics.filter(m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end);
        }
        const totalRequests = filteredMetrics.length;
        const totalTokens = filteredMetrics.reduce((sum, m) => sum + m.tokens_used, 0);
        const successfulRequests = filteredMetrics.filter(m => m.status === 'success');
        const averageResponseTime = successfulRequests.length > 0
            ? successfulRequests.reduce((sum, m) => sum + m.request_duration, 0) / successfulRequests.length
            : 0;
        const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests.length) / totalRequests : 0;
        const requestsByModel = {};
        const requestsByUser = {};
        filteredMetrics.forEach(metric => {
            requestsByModel[metric.model] = (requestsByModel[metric.model] || 0) + 1;
            if (metric.user_id) {
                requestsByUser[metric.user_id] = (requestsByUser[metric.user_id] || 0) + 1;
            }
        });
        // Get recent requests (last 50)
        const recentRequests = this.metrics.slice(-50).reverse();
        return {
            totalRequests,
            totalTokens,
            averageResponseTime,
            errorRate,
            requestsByModel,
            requestsByUser,
            recentRequests
        };
    }
    async getMetricsSummary(hours = 24) {
        const endTime = Date.now();
        const startTime = endTime - (hours * 60 * 60 * 1000);
        return await this.getMetrics({ start: startTime, end: endTime });
    }
    isMetricsEnabled() {
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.usage');
        return config.get('trackingEnabled', true);
    }
    dispose() {
        // Clean up resources if needed
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=MetricsService.js.map