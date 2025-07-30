import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { AppConnectionStatus, AppConnection } from '@prisma/client';

@Injectable()
export class AppConnectionDbService {
  private readonly logger = new Logger(AppConnectionDbService.name);
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Retrieve all active (and optionally, all) app connections for a user.
   */
  async getUserConnections(userId: string, status: AppConnectionStatus = 'ACTIVE'): Promise<{ [appName: string]: string }> {
    const cacheKey = `user_connections:${userId}:${status}`;
    try {
      // Use cache
      const cached = await this.cache.get<{ [appName: string]: string }>(cacheKey);
      if (cached) return cached;

      const connections = await this.prisma.safeExecute(async () => {
        return await this.prisma.appConnection.findMany({
          where: { userId, status },
          select: { appName: true, accountId: true },
        });
      });

      const connMap = (connections || []).reduce((acc, conn) => {
        acc[conn.appName] = conn.accountId;
        return acc;
      }, {} as { [appName: string]: string });

      await this.cache.set(cacheKey, connMap, this.CACHE_TTL);
      return connMap;
    } catch (error) {
      this.logger.error(`Error fetching app connections for user ${userId}:`, error);
      return {}; // Fallback
    }
  }

  /**
   * Upsert (create/update) an app connection for a user/app.
   */
  async upsertConnection(
    userId: string,
    appName: string,
    accountId: string,
    status: AppConnectionStatus = 'ACTIVE',
    metadata?: any
  ): Promise<AppConnection | null> {
    try {
      const connection = await this.prisma.safeExecute(async () => {
        return await this.prisma.appConnection.upsert({
          where: { userId_appName: { userId, appName } },
          update: {
            accountId,
            status,
            metadata,
            updatedAt: new Date(),
          },
          create: {
            userId,
            appName,
            accountId,
            status,
            metadata,
          }
        });
      });

      // Invalidate cache for user
      await this.cache.delete(`user_connections:${userId}:ACTIVE`);
      this.logger.log(`[AppConn] Upserted connection: ${userId}/${appName} ${status}`);
      return connection || null;
    } catch (error) {
      this.logger.error(`Upsert failed for user=${userId} app=${appName}:`, error);
      return null;
    }
  }

  /**
   * Remove (mark as INACTIVE/EXPIRED) a user's app connection.
   */
  async deactivateConnection(userId: string, appName: string, status: AppConnectionStatus = 'INACTIVE') {
    try {
      await this.prisma.safeExecute(async () => {
        await this.prisma.appConnection.update({
          where: { userId_appName: { userId, appName } },
          data: {
            status,
            updatedAt: new Date()
          }
        });
      });
      await this.cache.delete(`user_connections:${userId}:ACTIVE`);
      this.logger.log(`[AppConn] Set ${appName} to ${status} for user ${userId}`);
    } catch (error) {
      this.logger.error(`[AppConn] Error marking ${appName}/${userId} as ${status}:`, error);
    }
  }

  /**
   * Get full AppConnection details for a user/app.
   */
  async getConnection(userId: string, appName: string): Promise<AppConnection | null> {
    try {
      return await this.prisma.safeExecute(async () =>
        await this.prisma.appConnection.findUnique({
          where: { userId_appName: { userId, appName } }
        })
      );
    } catch (error) {
      this.logger.error(`[AppConn] Error fetching ${appName}/${userId}:`, error);
      return null;
    }
  }

  /**
   * List all app connections for a user (all statuses).
   */
  async listAllConnections(userId: string): Promise<AppConnection[]> {
    try {
      return (
        (await this.prisma.safeExecute(async () =>
          await this.prisma.appConnection.findMany({
            where: { userId },
            orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
          })
        )) || []
      );
    } catch (error) {
      this.logger.error(`[AppConn] List all error for user ${userId}:`, error);
      return [];
    }
  }
}
