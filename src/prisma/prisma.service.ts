import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private isHealthy: boolean = false;
  private connectionAttempts: number = 0;
  private readonly maxRetries: number = 3;

  constructor() {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
      errorFormat: 'colorless',
    });

    // Note: Prisma event listeners are not available in this version
    // Logging will be handled through the safeExecute method
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.isHealthy = false;
      this.logger.log('🔌 Database disconnected successfully');
    } catch (error) {
      this.logger.error('Error during database disconnection:', error);
    }
  }

  private async connectWithRetry(): Promise<void> {
    while (this.connectionAttempts < this.maxRetries) {
      try {
        await this.$connect();
        this.isHealthy = true;
        this.logger.log('✅ Database connected successfully');

        // Test the connection
        await this.healthCheck();
        return;
      } catch (error) {
        this.connectionAttempts++;
        this.isHealthy = false;

        this.logger.error(
          `❌ Database connection attempt ${this.connectionAttempts}/${this.maxRetries} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (this.connectionAttempts >= this.maxRetries) {
          this.logger.error(
            '🚨 Maximum database connection attempts reached. Application will continue without database functionality.',
          );
          break;
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, this.connectionAttempts) * 1000;
        this.logger.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Check if the database connection is healthy
   */
  async isConnected(): Promise<boolean> {
    if (!this.isHealthy) {
      return false;
    }

    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn('Database health check failed:', error);
      this.isHealthy = false;
      return false;
    }
  }

  /**
   * Perform a comprehensive health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      responseTime: number;
      error?: string;
    };
  }> {
    const startTime = Date.now();

    try {
      await this.$queryRaw`SELECT 1 as health_check`;
      const responseTime = Date.now() - startTime;

      this.isHealthy = true;

      return {
        status: 'healthy',
        details: {
          connected: true,
          responseTime,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.isHealthy = false;

      return {
        status: 'unhealthy',
        details: {
          connected: false,
          responseTime,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Execute a database operation with error handling
   * Returns null if database is unavailable instead of throwing
   */
  async safeExecute<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      const isConnected = await this.isConnected();
      if (!isConnected) {
        this.logger.warn('Database not available, skipping operation');
        return null;
      }

      return await operation();
    } catch (error) {
      this.logger.error('Database operation failed:', error);
      this.isHealthy = false;
      return null;
    }
  }

  /**
   * Execute a database operation with automatic retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries: number = 2,
  ): Promise<T | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const isConnected = await this.isConnected();
        if (!isConnected && attempt === 0) {
          // Try to reconnect on first attempt
          await this.connectWithRetry();
        }

        if (await this.isConnected()) {
          return await operation();
        }
      } catch (error) {
        this.logger.error(
          `Database operation attempt ${attempt + 1} failed:`,
          error,
        );

        if (attempt === retries) {
          this.logger.error('All database operation attempts failed');
          return null;
        }

        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
      }
    }

    return null;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    isHealthy: boolean;
    connectionAttempts: number;
    uptime: string;
  } | null> {
    try {
      const isConnected = await this.isConnected();

      return {
        isHealthy: this.isHealthy,
        connectionAttempts: this.connectionAttempts,
        uptime: isConnected ? 'Connected' : 'Disconnected',
      };
    } catch (error) {
      this.logger.error('Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * Force reconnection (useful for testing or recovery)
   */
  async reconnect(): Promise<boolean> {
    try {
      this.logger.log('🔄 Forcing database reconnection...');

      await this.$disconnect();
      this.isHealthy = false;
      this.connectionAttempts = 0;

      await this.connectWithRetry();

      return this.isHealthy;
    } catch (error) {
      this.logger.error('Force reconnection failed:', error);
      return false;
    }
  }
}

// // Example usage in your chat services:
// const result = await this.prisma.safeExecute(async () => {
//   return await this.prisma.user.findUnique({ where: { id: userId } });
// });

// if (result) {
//   // Database operation succeeded
//   console.log('User found:', result);
// } else {
//   // Database unavailable, use fallback
//   console.log('Using in-memory fallback');
// }
