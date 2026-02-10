import { MetricsData } from '../types';
export declare class MetricsService {
    private metrics;
    private maxMetrics;
    private metricsEndpoint;
    constructor();
    recordRequest(data: Omit<MetricsData, 'timestamp'>): Promise<void>;
    getMetrics(timeRange?: {
        start: number;
        end: number;
    }): Promise<{
        totalRequests: number;
        totalTokens: number;
        averageResponseTime: number;
        errorRate: number;
        requestsByModel: Record<string, number>;
        requestsByUser: Record<string, number>;
        recentRequests: MetricsData[];
    }>;
    getMetricsSummary(hours?: number): Promise<any>;
    private isMetricsEnabled;
    dispose(): void;
}
//# sourceMappingURL=MetricsService.d.ts.map