export declare class RequestQueue {
    private queue;
    private activeCount;
    private maxConcurrent;
    private totalProcessed;
    private totalErrors;
    private responseTimes;
    private maxResponseTimes;
    constructor(maxConcurrent: number);
    add<T>(task: () => Promise<T>): Promise<T>;
    private processQueue;
    private executeTask;
    private recordResponseTime;
    getQueueLength(): number;
    getActiveCount(): number;
    getTotalProcessed(): number;
    getAverageResponseTime(): number;
    getErrorRate(): number;
    clear(): void;
}
//# sourceMappingURL=RequestQueue.d.ts.map