"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueue = void 0;
class RequestQueue {
    constructor(maxConcurrent) {
        this.queue = [];
        this.activeCount = 0;
        this.totalProcessed = 0;
        this.totalErrors = 0;
        this.responseTimes = [];
        this.maxResponseTimes = 100; // Keep last 100 response times
        this.maxConcurrent = maxConcurrent;
    }
    async add(task) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                id: Math.random().toString(36).substring(7),
                task,
                responsePromise: { resolve, reject },
                timestamp: Date.now(),
                priority: 0
            };
            this.queue.push(queueItem);
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        const item = this.queue.shift();
        if (!item)
            return;
        this.activeCount++;
        const startTime = Date.now();
        try {
            const result = await item.task();
            // Record success metrics
            const responseTime = Date.now() - startTime;
            this.recordResponseTime(responseTime);
            this.totalProcessed++;
            item.responsePromise.resolve(result);
        }
        catch (error) {
            // Record error metrics
            const responseTime = Date.now() - startTime;
            this.recordResponseTime(responseTime);
            this.totalErrors++;
            this.totalProcessed++;
            item.responsePromise.reject(error);
        }
        finally {
            this.activeCount--;
            // Process next item in queue
            setImmediate(() => this.processQueue());
        }
    }
    recordResponseTime(time) {
        this.responseTimes.push(time);
        if (this.responseTimes.length > this.maxResponseTimes) {
            this.responseTimes.shift();
        }
    }
    getQueueLength() {
        return this.queue.length;
    }
    getActiveCount() {
        return this.activeCount;
    }
    getTotalProcessed() {
        return this.totalProcessed;
    }
    getAverageResponseTime() {
        if (this.responseTimes.length === 0)
            return 0;
        return this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }
    getErrorRate() {
        if (this.totalProcessed === 0)
            return 0;
        return this.totalErrors / this.totalProcessed;
    }
    clear() {
        this.queue = [];
        this.activeCount = 0;
        this.totalProcessed = 0;
        this.totalErrors = 0;
        this.responseTimes = [];
    }
}
exports.RequestQueue = RequestQueue;
//# sourceMappingURL=RequestQueue.js.map