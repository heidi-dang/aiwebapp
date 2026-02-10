import { QueueItem } from '../types';

export class RequestQueue {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private totalProcessed = 0;
  private totalErrors = 0;
  private responseTimes: number[] = [];
  private maxResponseTimes = 100; // Keep last 100 response times

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(_task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem = {
        id: Math.random().toString(36).substring(7),
        request: {} as any, // Not used in this simplified version
        responsePromise: { resolve, reject },
        timestamp: Date.now(),
        priority: 0
      };

      this.queue.push(queueItem);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    const startTime = Date.now();

    try {
      // Execute the task (this will be the Copilot API call)
      const result = await this.executeTask(item);

      // Record success metrics
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      this.totalProcessed++;

      item.responsePromise.resolve(result);
    } catch (error) {
      // Record error metrics
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      this.totalErrors++;
      this.totalProcessed++;

      item.responsePromise.reject(error);
    } finally {
      this.activeCount--;
      // Process next item in queue
      setImmediate(() => this.processQueue());
    }
  }

  private async executeTask(_item: QueueItem): Promise<any> {
    // This is a placeholder - the actual task execution happens in the calling code
    // The task function is passed to the add method
    throw new Error('Task execution should be handled by the caller');
  }

  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getTotalProcessed(): number {
    return this.totalProcessed;
  }

  getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  getErrorRate(): number {
    if (this.totalProcessed === 0) return 0;
    return this.totalErrors / this.totalProcessed;
  }

  clear(): void {
    this.queue = [];
    this.activeCount = 0;
    this.totalProcessed = 0;
    this.totalErrors = 0;
    this.responseTimes = [];
  }
}