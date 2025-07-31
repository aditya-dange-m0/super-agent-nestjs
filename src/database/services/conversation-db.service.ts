import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { Conversation } from '@prisma/client';

@Injectable()
export class ConversationDbService {
  private readonly logger = new Logger(ConversationDbService.name);
  private readonly CONV_CACHE_TTL = 600; // 10m

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Get all conversations for a session (most recent first).
   */
  async getConversationsForSession(
    sessionId: string,
    limit: number = 5,
  ): Promise<Conversation[]> {
    const cacheKey = `conversations:${sessionId}:${limit}`;
    try {
      const cached = await this.cache.get<Conversation[]>(cacheKey);
      if (cached) return cached;

      const conversations = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      });

      await this.cache.set(cacheKey, conversations || [], this.CONV_CACHE_TTL);
      return conversations || [];
    } catch (error) {
      this.logger.error(
        `[Conversation] Error fetching conversations for session ${sessionId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Create a new conversation for this session.
   */
  async createConversation(
    sessionId: string,
    title?: string,
  ): Promise<Conversation | null> {
    try {
      const conversation = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.create({
          data: {
            sessionId,
            title: title || `Conversation on ${new Date().toLocaleString()}`,
          },
        });
      });

      // Invalidate cache for session's conversations
      await this.cache.delete(`conversations:${sessionId}:5`);
      this.logger.log(
        `[Conversation] Created new conversation for session ${sessionId}`,
      );
      return conversation || null;
    } catch (error) {
      this.logger.error(
        `[Conversation] Error creating conversation for session ${sessionId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Soft delete a conversation (by marking as inactive, if such behavior is needed).
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    // If you have a deletedAt soft-delete field, set here; otherwise actually delete:
    try {
      await this.prisma.safeExecute(async () => {
        await this.prisma.conversation.delete({
          where: { id: conversationId },
        });
      });
      this.logger.log(`[Conversation] Deleted conversation ${conversationId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `[Conversation] Error deleting conversation ${conversationId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Update the title of a conversation.
   */
  async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<boolean> {
    try {
      const updated = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { title, updatedAt: new Date() },
        });
      });
      this.logger.log(
        `[Conversation] Updated title for conversation ${conversationId}`,
      );
      return !!updated;
    } catch (error) {
      this.logger.error(
        `[Conversation] Error updating title for conversation ${conversationId}:`,
        error,
      );
      return false;
    }
  }
}
