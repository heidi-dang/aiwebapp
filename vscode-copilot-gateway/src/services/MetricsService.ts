import * as vscode from 'vscode';
import axios from 'axios';
import { MetricsData } from '../types';

export class MetricsService {
  private metrics: MetricsData[] = [];
  private maxMetrics: number = 1000;
  private metricsEndpoint: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.usage');
    this.metricsEndpoint = config.get('metricsEndpoint', 'http://localhost:4001/api/metrics');
  }

  async recordRequest(data: MetricsData): Promise<void> {
    const metric: MetricsData = {
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
        await axios.post(this.metricsEndpoint, metric, {
          timeout: 2000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.warn('Failed to send metrics to endpoint:', error);
        // Don't throw - metrics failure shouldn't break the API
      }
    }
  }

  async getMetrics(timeRange?: { start: number; end: number }): Promise<{
    totalRequests: number;
    totalTokens: number;
    averageResponseTime: number;
    errorRate: number;
    requestsByModel: Record<string, number>;
    requestsByUser: Record<string, number>;
    recentRequests: MetricsData[];
  }> {
    let filteredMetrics = this.metrics;

    if (timeRange) {
      filteredMetrics = this.metrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const totalRequests = filteredMetrics.length;
    const totalTokens = filteredMetrics.reduce((sum, m) => sum + m.tokens_used, 0);
    const successfulRequests = filteredMetrics.filter(m => m.status === 'success');
    const averageResponseTime = successfulRequests.length > 0
      ? successfulRequests.reduce((sum, m) => sum + m.request_duration, 0) / successfulRequests.length
      : 0;
    const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests.length) / totalRequests : 0;

    const requestsByModel: Record<string, number> = {};
    const requestsByUser: Record<string, number> = {};

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

  async getMetricsSummary(hours: number = 24): Promise<any> {
    const endTime = Date.now();
    const startTime = endTime - (hours * 60 * 60 * 1000);

    return await this.getMetrics({ start: startTime, end: endTime });
  }

  private isMetricsEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.usage');
    return config.get('trackingEnabled', true);
  }

  dispose(): void {
    // Clean up resources if needed
  }
}
