export class RequestQueue {
  constructor(maxConcurrent: number) {}

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  getTotalProcessed(): number {
    return 0;
  }

  getActiveCount(): number {
    return 0;
  }

  getQueueLength(): number {
    return 0;
  }

  getAverageResponseTime(): number {
    return 0;
  }

  getErrorRate(): number {
    return 0;
  }
}