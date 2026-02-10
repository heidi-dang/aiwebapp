export interface MetricsData {
  timestamp: number;
  user_id?: string;
  session_id?: string;
  model: string;
  tokens_used: number;
  request_duration: number;
  status: string;
  error_type?: string;
}

export class MetricsService {
  recordRequest(data: MetricsData) {}

  async getMetrics() {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      recentRequests: []
    };
  }

  dispose() {}
}