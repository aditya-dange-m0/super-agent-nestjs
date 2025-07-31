import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { User } from '@prisma/client';

@Injectable()
export class UserDbService {
  private readonly logger = new Logger(UserDbService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Find or create a user by ID with caching
   */
  async findOrCreateUser(
    userId: string,
    email?: string,
    name?: string,
  ): Promise<User | null> {
    const cacheKey = `user:${userId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<User>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT: User ${userId}`);
        return cached;
      }

      this.logger.debug(`Cache MISS: User ${userId}, checking database...`);

      // Execute with safe database operation
      const user = await this.prisma.safeExecute(async () => {
        return await this.prisma.user.upsert({
          where: { id: userId },
          update: {
            updatedAt: new Date(),
            // Update email/name if provided
            ...(email && { email }),
            ...(name && { name }),
          },
          create: {
            id: userId,
            email: email || '',
            name: name || null,
          },
        });
      });

      if (user) {
        // Cache the result
        await this.cache.set(cacheKey, user, this.CACHE_TTL);
        this.logger.log(`User ${userId} found/created and cached`);
        return user;
      } else {
        // Database unavailable, return minimal user object
        this.logger.warn(
          `Database unavailable, returning fallback user for ${userId}`,
        );
        const fallbackUser = {
          id: userId,
          email: email || null,
          name: name || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as User;

        // Cache fallback for short time
        await this.cache.set(cacheKey, fallbackUser, 300); // 5 minutes
        return fallbackUser;
      }
    } catch (error) {
      this.logger.error(`Error in findOrCreateUser for ${userId}:`, error);

      // Return fallback user object
      const fallbackUser = {
        id: userId,
        email: email || null,
        name: name || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      return fallbackUser;
    }
  }

  /**
   * Get user by ID with caching
   */
  async getUserById(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<User>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT: User ${userId}`);
        return cached;
      }

      // Query database
      const user = await this.prisma.safeExecute(async () => {
        return await this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            sessions: {
              where: { isActive: true },
              orderBy: { lastActivity: 'desc' },
              take: 5, // Last 5 active sessions
            },
            appConnections: {
              where: { status: 'ACTIVE' },
            },
          },
        });
      });

      if (user) {
        await this.cache.set(cacheKey, user, this.CACHE_TTL);
        this.logger.debug(`User ${userId} retrieved from database and cached`);
        return user;
      }

      this.logger.debug(`User ${userId} not found`);
      return null;
    } catch (error) {
      this.logger.error(`Error getting user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Update user information
   */
  async updateUser(
    userId: string,
    updates: { email?: string; name?: string },
  ): Promise<User | null> {
    try {
      const user = await this.prisma.safeExecute(async () => {
        return await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...updates,
            updatedAt: new Date(),
          },
        });
      });

      if (user) {
        // Invalidate cache
        const cacheKey = `user:${userId}`;
        await this.cache.delete(cacheKey);
        this.logger.log(`User ${userId} updated and cache invalidated`);
        return user;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error updating user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get user with their active sessions and connections
   */
  async getUserWithDetails(userId: string): Promise<{
    user: User | null;
    activeSessions: number;
    activeConnections: number;
  }> {
    const cacheKey = `user_details:${userId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<{
        user: User;
        activeSessions: number;
        activeConnections: number;
      }>(cacheKey);

      if (cached) {
        this.logger.debug(`Cache HIT: User details ${userId}`);
        return cached;
      }

      // Get user with related data
      const user = await this.prisma.safeExecute(async () => {
        return await this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            sessions: {
              where: { isActive: true },
            },
            appConnections: {
              where: { status: 'ACTIVE' },
            },
          },
        });
      });

      if (user) {
        const result = {
          user,
          activeSessions: user.sessions.length,
          activeConnections: user.appConnections.length,
        };

        // Cache for shorter time since it includes counts
        await this.cache.set(cacheKey, result, 900); // 15 minutes
        this.logger.debug(`User details ${userId} retrieved and cached`);
        return result;
      }

      return {
        user: null,
        activeSessions: 0,
        activeConnections: 0,
      };
    } catch (error) {
      this.logger.error(`Error getting user details ${userId}:`, error);
      return {
        user: null,
        activeSessions: 0,
        activeConnections: 0,
      };
    }
  }

  /**
   * Check if user exists
   */
  async userExists(userId: string): Promise<boolean> {
    const cacheKey = `user_exists:${userId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const exists = await this.prisma.safeExecute(async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true }, // Only select ID for efficiency
        });
        return !!user;
      });

      const result = exists ?? false;

      // Cache existence check for shorter time
      await this.cache.set(cacheKey, result, 1800); // 30 minutes

      return result;
    } catch (error) {
      this.logger.error(`Error checking if user ${userId} exists:`, error);
      return false;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const cacheKey = `user_email:${email}`;

    try {
      // Check cache first
      const cached = await this.cache.get<User>(cacheKey);
      if (cached) {
        return cached;
      }

      const user = await this.prisma.safeExecute(async () => {
        return await this.prisma.user.findUnique({
          where: { email },
        });
      });

      if (user) {
        await this.cache.set(cacheKey, user, this.CACHE_TTL);
        this.logger.debug(`User found by email ${email} and cached`);
        return user;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting user by email ${email}:`, error);
      return null;
    }
  }

  /**
   * Delete user and all related data
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      const result = await this.prisma.safeExecute(async () => {
        // Prisma will handle cascading deletes due to onDelete: Cascade
        await this.prisma.user.delete({
          where: { id: userId },
        });
        return true;
      });

      if (result) {
        // Clear all related cache entries
        await this.clearUserCache(userId);
        this.logger.log(`User ${userId} deleted and cache cleared`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error deleting user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    appConnections: number;
    lastActivity: Date | null;
  } | null> {
    const cacheKey = `user_stats:${userId}`;

    try {
      // Check cache first
      const cached = await this.cache.get<{
        totalSessions: number;
        activeSessions: number;
        totalMessages: number;
        appConnections: number;
        lastActivity: Date | null;
      }>(cacheKey);
      if (cached) {
        return cached;
      }

      const stats = await this.prisma.safeExecute(async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            sessions: {
              include: {
                conversations: {
                  include: {
                    _count: {
                      select: { messages: true },
                    },
                  },
                },
              },
            },
            appConnections: true,
          },
        });

        if (!user) return null;

        const totalSessions = user.sessions.length;
        const activeSessions = user.sessions.filter((s) => s.isActive).length;
        const totalMessages = user.sessions.reduce((total, session) => {
          return (
            total +
            session.conversations.reduce((convTotal, conv) => {
              return convTotal + conv._count.messages;
            }, 0)
          );
        }, 0);
        const appConnections = user.appConnections.filter(
          (conn) => conn.status === 'ACTIVE',
        ).length;
        const lastActivity =
          user.sessions.length > 0
            ? new Date(
                Math.max(...user.sessions.map((s) => s.lastActivity.getTime())),
              )
            : null;

        return {
          totalSessions,
          activeSessions,
          totalMessages,
          appConnections,
          lastActivity,
        };
      });

      if (stats) {
        // Cache stats for shorter time
        await this.cache.set(cacheKey, stats, 600); // 10 minutes
        return stats;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting user stats ${userId}:`, error);
      return null;
    }
  }

  /**
   * Clear all cache entries for a user
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const cacheKeys = [
        `user:${userId}`,
        `user_details:${userId}`,
        `user_exists:${userId}`,
        `user_stats:${userId}`,
      ];

      for (const key of cacheKeys) {
        await this.cache.delete(key);
      }

      this.logger.debug(`Cache cleared for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error clearing cache for user ${userId}:`, error);
    }
  }

  /**
   * Batch create or update users (useful for migrations or bulk operations)
   */
  async batchUpsertUsers(
    users: Array<{
      id: string;
      email?: string;
      name?: string;
    }>,
  ): Promise<number> {
    let processed = 0;
    try {
      const result = await this.prisma.safeExecute(async () => {
        // Process in batches of 100
        const batchSize = 100;
        for (let i = 0; i < users.length; i += batchSize) {
          const batch = users.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (userData) => {
              await this.prisma.user.upsert({
                where: { id: userData.id },
                update: {
                  email: userData.email || undefined,
                  name: userData.name || null,
                  updatedAt: new Date(),
                },
                create: {
                  id: userData.id,
                  email: userData.email || '',
                  name: userData.name || null,
                },
              });
              processed++;
            }),
          );
        }
        return processed;
      });

      this.logger.log(`Batch upserted ${result || 0} users`);
      return result || 0;
    } catch (error) {
      this.logger.error(`Error in batch upsert users:`, error);
      return processed;
    }
  }
}
