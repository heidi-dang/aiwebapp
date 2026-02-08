interface CacheEntry<T> {
  data: T
  timestamp: number
  hits: number
}

export class LRUCache<K, V> {
  private readonly maxSize: number
  private readonly ttl: number
  private readonly cache: Map<K, CacheEntry<V>>
  private readonly accessOrder: K[]

  constructor(maxSize: number, ttl: number = 3600000) { // Default 1 hour TTL
    this.maxSize = maxSize
    this.ttl = ttl
    this.cache = new Map()
    this.accessOrder = []
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return undefined
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key)
      return undefined
    }

    // Update access order
    this.updateAccessOrder(key)
    entry.hits++
    
    return entry.data
  }

  set(key: K, value: V): void {
    // Remove expired entries first
    this.cleanupExpired()
    
    // If key exists, update it
    if (this.cache.has(key)) {
      this.cache.set(key, {
        data: value,
        timestamp: Date.now(),
        hits: this.cache.get(key)!.hits + 1
      })
      this.updateAccessOrder(key)
      return
    }

    // If cache is full, remove least recently used
    if (this.cache.size >= this.maxSize) {
      this.evictLRU()
    }

    // Add new entry
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      hits: 0
    })
    this.accessOrder.push(key)
  }

  delete(key: K): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
    }
    return deleted
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder.length = 0
  }

  size(): number {
    return this.cache.size
  }

  getStats(): { size: number; maxSize: number; avgHits: number; expiredCount: number } {
    let totalHits = 0
    let expiredCount = 0
    
    for (const entry of this.cache.values()) {
      totalHits += entry.hits
      if (Date.now() - entry.timestamp > this.ttl) {
        expiredCount++
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      avgHits: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      expiredCount
    }
  }

  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(key)
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return
    
    const lruKey = this.accessOrder[0]
    this.cache.delete(lruKey)
    this.accessOrder.shift()
  }

  private cleanupExpired(): void {
    const now = Date.now()
    const expiredKeys: K[] = []
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        expiredKeys.push(key)
      }
    }
    
    for (const key of expiredKeys) {
      this.delete(key)
    }
  }
}

export class SessionCache {
  private readonly sessionCache: LRUCache<string, any>
  private readonly sessionListCache: LRUCache<string, any[]>

  constructor(maxSessions: number = 1000, ttl: number = 3600000) {
    this.sessionCache = new LRUCache(maxSessions, ttl)
    this.sessionListCache = new LRUCache(maxSessions, ttl)
  }

  // Session cache methods
  getSession(sessionId: string): any | undefined {
    return this.sessionCache.get(`session:${sessionId}`)
  }

  setSession(sessionId: string, session: any): void {
    this.sessionCache.set(`session:${sessionId}`, session)
  }

  deleteSession(sessionId: string): boolean {
    return this.sessionCache.delete(`session:${sessionId}`)
  }

  // Session list cache methods
  getSessionList(cacheKey: string): any[] | undefined {
    return this.sessionListCache.get(`list:${cacheKey}`)
  }

  setSessionList(cacheKey: string, sessions: any[]): void {
    this.sessionListCache.set(`list:${cacheKey}`, sessions)
  }

  deleteSessionList(cacheKey: string): boolean {
    return this.sessionListCache.delete(`list:${cacheKey}`)
  }

  // Clear all cache
  clear(): void {
    this.sessionCache.clear()
    this.sessionListCache.clear()
  }

  getStats(): object {
    return {
      sessions: this.sessionCache.getStats(),
      sessionLists: this.sessionListCache.getStats()
    }
  }
}

export const sessionCache = new SessionCache()