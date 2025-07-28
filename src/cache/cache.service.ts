import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface ComprehensiveAnalysis {
  queryAnalysis: string;
  isQueryClear: boolean;
  confidenceScore: number;
  requiresToolExecution: boolean;
  executionSteps: any[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiresSequentialExecution: boolean;
  needsInfoGathering: boolean;
  missingInformation: string[];
  searchQueries: string[];
  clarificationNeeded: string[];
  canProceedWithDefaults: boolean;
  conversationSummary: any;
  recommendedApps: string[];
  toolPriorities: any[];
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private readonly cacheTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 300); // 5 minutes default
  }

  async onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      keepAlive: 30000,
    });

    this.redis.on('error', (err) => {
      this.logger.error('[Redis] Connection Error:', err);
    });

    this.redis.on('connect', () => {
      this.logger.log('[Redis] Connected successfully');
    });

    this.redis.on('ready', () => {
      this.logger.log('[Redis] Ready to receive commands');
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.disconnect();
      this.logger.log('[Redis] Disconnected successfully');
    }
  }

  // Generic Redis operations
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.warn(`[Redis] GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number = this.cacheTtl): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.logger.warn(`[Redis] SET error for key ${key}:`, error);
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    try {
      const values = await this.redis.mget(...keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      this.logger.warn(`[Redis] MGET error:`, error);
      return new Array(keys.length).fill(null);
    }
  }

  async mset(keyValuePairs: { key: string; value: any; ttl?: number }[]): Promise<void> {
    if (keyValuePairs.length === 0) return;
    try {
      const pipeline = this.redis.pipeline();
      keyValuePairs.forEach(({ key, value, ttl = this.cacheTtl }) => {
        pipeline.setex(key, ttl, JSON.stringify(value));
      });
      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`[Redis] MSET error:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`[Redis] DELETE error for key ${key}:`, error);
    }
  }

  // Specialized cache methods from your original code

  // Tool search caching
  async getCachedToolSearch(appName: string, query: string): Promise<string[] | null> {
    const key = `tool_search:${appName}:${this.hashString(query)}`;
    const cached = await this.get<string[]>(key);
    if (cached) {
      this.logger.log(`Cache HIT: Tool search for ${appName}:${query}`);
      return cached;
    }
    this.logger.log(`Cache MISS: Tool search for ${appName}:${query}`);
    return null;
  }

  async setCachedToolSearch(appName: string, query: string, tools: string[]): Promise<void> {
    const key = `tool_search:${appName}:${this.hashString(query)}`;
    await this.set(key, tools);
    this.logger.log(`Cache SET: Tool search for ${appName}:${query}`);
  }

  // App routing caching
  async getCachedAppRouting(query: string): Promise<string[] | null> {
    const key = `app_routing:${this.hashString(query)}`;
    const cached = await this.get<string[]>(key);
    if (cached) {
      this.logger.log(`Cache HIT: App routing for ${query}`);
      return cached;
    }
    this.logger.log(`Cache MISS: App routing for ${query}`);
    return null;
  }

  async setCachedAppRouting(query: string, apps: string[]): Promise<void> {
    const key = `app_routing:${this.hashString(query)}`;
    await this.set(key, apps);
    this.logger.log(`Cache SET: App routing for ${query}`);
  }

  // Connection status caching
  async getCachedConnectionStatus(connectionId: string): Promise<any | null> {
    const key = `connection_status:${connectionId}`;
    const cached = await this.get<any>(key);
    if (cached) {
      this.logger.log(`Cache HIT: Connection status for ${connectionId}`);
      return cached;
    }
    this.logger.log(`Cache MISS: Connection status for ${connectionId}`);
    return null;
  }

  async setCachedConnectionStatus(connectionId: string, status: any): Promise<void> {
    const key = `connection_status:${connectionId}`;
    await this.set(key, status);
    this.logger.log(`Cache SET: Connection status for ${connectionId}`);
  }

  // Analysis caching
  async getCachedAnalysis(queryHash: string): Promise<ComprehensiveAnalysis | null> {
    const key = `analysis:${queryHash}`;
    const cached = await this.get<ComprehensiveAnalysis>(key);
    if (cached) {
      this.logger.log(`Cache HIT: Analysis for hash ${queryHash}`);
      return cached;
    }
    this.logger.log(`Cache MISS: Analysis for hash ${queryHash}`);
    return null;
  }

  async setCachedAnalysis(queryHash: string, analysis: ComprehensiveAnalysis): Promise<void> {
    const key = `analysis:${queryHash}`;
    await this.set(key, analysis);
    this.logger.log(`Cache SET: Analysis for hash ${queryHash}`);
  }

  // Helper methods
  private hashString(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/[/+=]/g, '_');
  }

  // Health check
  async healthCheck(): Promise<{ status: string; connection: string }> {
    try {
      const pingResult = await this.redis.ping();
      const connectionStatus = this.redis.status;
      
      return {
        status: pingResult === 'PONG' ? 'healthy' : 'unhealthy',
        connection: connectionStatus,
      };
    } catch (error) {
      this.logger.error('Cache health check failed:', error);
      return {
        status: 'unhealthy',
        connection: 'disconnected',
      };
    }
  }
}
