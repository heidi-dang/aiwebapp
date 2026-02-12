/**
 * Rate limiter for tool usage to prevent abuse
 */

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

export class ToolRateLimiter {
  private limits: Map<string, RateLimitInfo> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60 * 1000, maxRequests: number = 100) { // 1 minute window, 100 requests
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if a request is allowed based on rate limits
   * @param key Unique identifier for the rate limit (e.g., job ID + tool name)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const limitInfo = this.limits.get(key);

    if (!limitInfo || now > limitInfo.resetTime) {
      // Reset the counter if window has passed
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (limitInfo.count >= this.maxRequests) {
      return false; // Rate limited
    }

    // Increment the counter
    this.limits.set(key, {
      count: limitInfo.count + 1,
      resetTime: limitInfo.resetTime
    });

    return true;
  }

  /**
   * Get remaining requests and reset time for a key
   */
  getRateLimitInfo(key: string): { remaining: number; resetTime: number } {
    const now = Date.now();
    const limitInfo = this.limits.get(key);

    if (!limitInfo || now > limitInfo.resetTime) {
      return {
        remaining: this.maxRequests,
        resetTime: now + this.windowMs
      };
    }

    return {
      remaining: Math.max(0, this.maxRequests - limitInfo.count),
      resetTime: limitInfo.resetTime
    };
  }

  /**
   * Clear rate limit for a specific key
   */
  clear(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.limits.clear();
  }
}

// Global rate limiter instance
export const globalRateLimiter = new ToolRateLimiter(60 * 1000, 100); // 100 requests per minute globally

// Per-job rate limiter
export const jobRateLimiter = new ToolRateLimiter(60 * 1000, 50); // 50 requests per minute per job
