import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { UserDbService } from './user-db.service';
import { ComprehensiveAnalysis } from '../../chat/interfaces/chat.interfaces';
import { Session } from '@prisma/client';

@Injectable()
export class SessionDbService {
  private readonly logger = new Logger(SessionDbService.name);
  private readonly SESSION_CACHE_TTL = 1800; // 30 minutes
  private readonly SUMMARY_CACHE_TTL = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly userDbService: UserDbService,
  ) {}

  /**
   * Find or create a session with caching and fallback
   */
  async findOrCreateSession(
    userId: string,
    sessionId?: string,
  ): Promise<Session | null> {
    try {
      // If no sessionId provided, generate a new one
      if (!sessionId) {
        sessionId = this.generateSessionId();
        this.logger.log(
          `Generated new session ID: ${sessionId} for user ${userId}`,
        );
      }

      const cacheKey = `session:${sessionId}`;

      // Check cache first
      const cached = await this.cache.get<Session>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT: Session ${sessionId}`);
        return cached;
      }

      this.logger.debug(
        `Cache MISS: Session ${sessionId}, checking database...`,
      );

      // Ensure user exists first
      await this.userDbService.findOrCreateUser(userId);

      // Execute with safe database operation
      const session = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.upsert({
          where: { id: sessionId },
          update: {
            lastActivity: new Date(),
            updatedAt: new Date(),
            isActive: true, // Reactivate if was inactive
          },
          create: {
            id: sessionId,
            userId,
            sessionToken: sessionId, // Use sessionId as token for simplicity
            isActive: true,
          },
        });
      });

      if (session) {
        // Cache the result
        await this.cache.set(cacheKey, session, this.SESSION_CACHE_TTL);
        this.logger.log(
          `Session ${sessionId} found/created and cached for user ${userId}`,
        );
        return session;
      } else {
        // Database unavailable, return fallback session object
        this.logger.warn(
          `Database unavailable, returning fallback session for ${sessionId}`,
        );
        const fallbackSession = {
          id: sessionId,
          userId,
          sessionToken: sessionId,
          startedAt: new Date(),
          updatedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
          conversationSummary: null,
        } as Session;

        // Cache fallback for short time
        await this.cache.set(cacheKey, fallbackSession, 300); // 5 minutes
        return fallbackSession;
      }
    } catch (error) {
      this.logger.error(
        `Error in findOrCreateSession for ${sessionId}:`,
        error,
      );

      // Return fallback session object
      const fallbackSessionId = sessionId || this.generateSessionId();
      const fallbackSession = {
        id: fallbackSessionId,
        userId,
        sessionToken: fallbackSessionId,
        startedAt: new Date(),
        updatedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        conversationSummary: null,
      } as Session;

      return fallbackSession;
    }
  }

  /**
   * Update session summary with ComprehensiveAnalysis
   */
  async updateSessionSummary(
    sessionId: string,
    analysis: ComprehensiveAnalysis,
  ): Promise<boolean> {
    try {
      const result = await this.prisma.safeExecute(async () => {
        const updatedSession = await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            conversationSummary: analysis as any, // Store as JSON
            lastActivity: new Date(),
            updatedAt: new Date(),
          },
        });
        return !!updatedSession;
      });

      if (result) {
        // Invalidate related caches
        await this.invalidateSessionCaches(sessionId);
        this.logger.log(`Session summary updated for ${sessionId}`);
        return true;
      } else {
        this.logger.warn(
          `Database unavailable, session summary not persisted for ${sessionId}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error updating session summary for ${sessionId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get session summary for LLM context
   */
  async getSessionSummary(
    sessionId: string,
  ): Promise<ComprehensiveAnalysis | null> {
    const cacheKey = `session_summary:${sessionId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<ComprehensiveAnalysis>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT: Session summary ${sessionId}`);
        return cached;
      }

      this.logger.debug(
        `Cache MISS: Session summary ${sessionId}, checking database...`,
      );

      // Query database
      const session = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: {
            conversationSummary: true,
            isActive: true,
          },
        });
      });

      if (session && session.conversationSummary) {
        const summary =
          session.conversationSummary as unknown as ComprehensiveAnalysis;

        // Cache the result
        await this.cache.set(cacheKey, summary, this.SUMMARY_CACHE_TTL);
        this.logger.debug(
          `Session summary ${sessionId} retrieved from database and cached`,
        );
        return summary;
      }

      this.logger.debug(
        `No conversation summary found for session ${sessionId}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Error getting session summary for ${sessionId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get session with basic info
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const cacheKey = `session:${sessionId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<Session>(cacheKey);
      if (cached) {
        return cached;
      }

      const session = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findUnique({
          where: { id: sessionId },
        });
      });

      if (session) {
        await this.cache.set(cacheKey, session, this.SESSION_CACHE_TTL);
        return session;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.safeExecute(async () => {
        const updatedSession = await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            lastActivity: new Date(),
            updatedAt: new Date(),
          },
        });
        return !!updatedSession;
      });

      if (result) {
        // Update cache without full invalidation
        const cacheKey = `session:${sessionId}`;
        const cached = await this.cache.get<Session>(cacheKey);
        if (cached) {
          cached.lastActivity = new Date();
          cached.updatedAt = new Date();
          await this.cache.set(cacheKey, cached, this.SESSION_CACHE_TTL);
        }

        this.logger.debug(`Session activity updated for ${sessionId}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Error updating session activity for ${sessionId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserActiveSessions(
    userId: string,
    limit: number = 10,
  ): Promise<Session[]> {
    const cacheKey = `user_sessions:${userId}:${limit}`;

    try {
      // Check cache first
      const cached = await this.cache.get<Session[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const sessions = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findMany({
          where: {
            userId,
            isActive: true,
          },
          orderBy: { lastActivity: 'desc' },
          take: limit,
        });
      });

      if (sessions) {
        await this.cache.set(cacheKey, sessions, 600); // 10 minutes
        return sessions;
      }

      return [];
    } catch (error) {
      this.logger.error(
        `Error getting active sessions for user ${userId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Deactivate session
   */
  async deactivateSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.safeExecute(async () => {
        const updatedSession = await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            isActive: false,
            updatedAt: new Date(),
          },
        });
        return !!updatedSession;
      });

      if (result) {
        await this.invalidateSessionCaches(sessionId);
        this.logger.log(`Session ${sessionId} deactivated`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error deactivating session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Delete session and all related data
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.safeExecute(async () => {
        // Prisma will handle cascading deletes
        await this.prisma.session.delete({
          where: { id: sessionId },
        });
        return true;
      });

      if (result) {
        await this.invalidateSessionCaches(sessionId);
        this.logger.log(`Session ${sessionId} deleted`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    conversationCount: number;
    duration: number; // in minutes
    lastActivity: Date | null;
    isActive: boolean;
  } | null> {
    const cacheKey = `session_stats:${sessionId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<{
        messageCount: number;
        conversationCount: number;
        duration: number;
        lastActivity: Date | null;
        isActive: boolean;
      }>(cacheKey);
      if (cached) {
        return cached;
      }

      const sessionWithStats = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            conversations: {
              include: {
                messages: {
                  select: { id: true }, // Only count
                },
              },
            },
          },
        });
      });

      if (sessionWithStats) {
        const messageCount = sessionWithStats.conversations.reduce(
          (total, conv) => total + conv.messages.length,
          0,
        );
        const conversationCount = sessionWithStats.conversations.length;
        const duration = Math.floor(
          (sessionWithStats.lastActivity.getTime() -
            sessionWithStats.startedAt.getTime()) /
            60000,
        );

        const stats = {
          messageCount,
          conversationCount,
          duration,
          lastActivity: sessionWithStats.lastActivity,
          isActive: sessionWithStats.isActive,
        };

        // Cache stats for shorter time
        await this.cache.set(cacheKey, stats, 300); // 5 minutes
        return stats;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting session stats for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Cleanup inactive sessions (for maintenance)
   */
  async cleanupInactiveSessions(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.safeExecute(async () => {
        const deletedSessions = await this.prisma.session.deleteMany({
          where: {
            isActive: false,
            lastActivity: {
              lt: cutoffDate,
            },
          },
        });
        return deletedSessions.count;
      });

      if (result) {
        this.logger.log(
          `Cleaned up ${result} inactive sessions older than ${olderThanDays} days`,
        );
        return result;
      }

      return 0;
    } catch (error) {
      this.logger.error(`Error cleaning up inactive sessions:`, error);
      return 0;
    }
  }

  /**
   * Batch update session summaries (useful for migrations)
   */
  async batchUpdateSessionSummaries(
    updates: Array<{
      sessionId: string;
      summary: ComprehensiveAnalysis;
    }>,
  ): Promise<number> {
    let updated = 0;

    try {
      const result = await this.prisma.safeExecute(async () => {
        // Process in batches of 50
        const batchSize = 50;
        for (let i = 0; i < updates.length; i += batchSize) {
          const batch = updates.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async ({ sessionId, summary }) => {
              try {
                await this.prisma.session.update({
                  where: { id: sessionId },
                  data: {
                    conversationSummary: summary as any,
                    updatedAt: new Date(),
                  },
                });
                updated++;
              } catch (error) {
                this.logger.warn(
                  `Failed to update session ${sessionId}:`,
                  error,
                );
              }
            }),
          );
        }
        return updated;
      });

      this.logger.log(`Batch updated ${result || 0} session summaries`);
      return result || 0;
    } catch (error) {
      this.logger.error(`Error in batch update session summaries:`, error);
      return updated;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `session_${timestamp}_${randomPart}`;
  }

  /**
   * Invalidate all caches related to a session
   */
  private async invalidateSessionCaches(sessionId: string): Promise<void> {
    try {
      const cacheKeys = [
        `session:${sessionId}`,
        `session_summary:${sessionId}`,
        `session_stats:${sessionId}`,
      ];

      for (const key of cacheKeys) {
        await this.cache.delete(key);
      }

      this.logger.debug(`Cache invalidated for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for session ${sessionId}:`,
        error,
      );
    }
  }

  /**
   * Check if session exists and is active
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const cacheKey = `session_active:${sessionId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const session = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: { isActive: true },
        });
      });

      const isActive = session?.isActive ?? false;

      // Cache for shorter time
      await this.cache.set(cacheKey, isActive, 600); // 10 minutes

      return isActive;
    } catch (error) {
      this.logger.error(
        `Error checking if session ${sessionId} is active:`,
        error,
      );
      return false;
    }
  }
}
