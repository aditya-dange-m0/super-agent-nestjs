import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { ChatMessage } from '../../chat/interfaces/chat.interfaces';
import { Message, Conversation } from '@prisma/client';

@Injectable()
export class MessageDbService {
  private readonly logger = new Logger(MessageDbService.name);
  private readonly MESSAGE_CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Retrieve the latest N messages for a session.
   */
  async getMessagesForSession(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
    const cacheKey = `messages:${sessionId}:${limit}`;
    try {
      // Check cache first
      const cached = await this.cache.get<ChatMessage[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Find the most recent conversation for the session
      const conversation = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.findFirst({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
        });
      });

      if (!conversation) {
        this.logger.debug(`No conversation found for session ${sessionId}`);
        return [];
      }

      // Get latest N messages
      const messages = await this.prisma.safeExecute(async () => {
        return await this.prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { timestamp: 'desc' },
          take: limit,
        });
      });

      if (!messages || messages.length === 0) {
        return [];
      }

      // Transform to ChatMessage format (sorted oldest-to-newest)
      const chatMessages: ChatMessage[] = messages
        .reverse()
        .map(msg => ({
          role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp.getTime(),
          toolCalls: msg.toolCalls as any ?? undefined,
          analysis: msg.analysis as any ?? undefined,
        }));

      // Cache
      await this.cache.set(cacheKey, chatMessages, this.MESSAGE_CACHE_TTL);
      return chatMessages;
    } catch (error) {
      this.logger.error(`Error getting messages for session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Save a chat message (user or assistant) for a session.
   * Automatically creates a conversation if one doesn't exist.
   */
  async saveMessageToSession(sessionId: string, message: ChatMessage): Promise<Message | null> {
    try {
      // Ensure a conversation exists for this session
      let conversation: Conversation | null = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.findFirst({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
        });
      });

      if (!conversation) {
        conversation = await this.prisma.safeExecute(async () => {
          return await this.prisma.conversation.create({
            data: {
              sessionId,
              title: `Conversation on ${new Date().toLocaleString()}`,
            },
          });
        });
      }

      if (!conversation) {
        this.logger.error(`Could not create or find conversation for session ${sessionId}`);
        return null;
      }

      // Create the message
      const createdMessage = await this.prisma.safeExecute(async () => {
        return await this.prisma.message.create({
          data: {
            conversationId: conversation!.id,
            role: message.role.toUpperCase() as any,
            content: message.content,
            timestamp: new Date(message.timestamp),
            toolCalls: message.toolCalls as any ?? undefined,
            analysis: message.analysis as any ?? undefined,
            metadata: undefined, // Add structure as needed
          },
        });
      });

      // Invalidate message cache for this session
      await this.cache.delete(`messages:${sessionId}:10`);
      this.logger.debug(`Saved message to session ${sessionId} (role: ${message.role})`);
      return createdMessage ?? null;
    } catch (error) {
      this.logger.error(`Error saving message for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Delete all messages for a session's conversation(s) (admin/maintenance).
   */
  async clearMessagesForSession(sessionId: string): Promise<number> {
    try {
      const conversations = await this.prisma.safeExecute(async () => {
        return await this.prisma.conversation.findMany({
          where: { sessionId },
          select: { id: true },
        });
      });
      if (!conversations || conversations.length === 0) return 0;
      let totalDeleted = 0;
      for (const conv of conversations) {
        const deleted = await this.prisma.safeExecute(async () => {
          return await this.prisma.message.deleteMany({
            where: { conversationId: conv.id },
          });
        });
        totalDeleted += deleted?.count ?? 0;
        await this.cache.delete(`messages:${sessionId}:10`);
      }
      this.logger.log(`Cleared ${totalDeleted} messages for session ${sessionId}`);
      return totalDeleted;
    } catch (error) {
      this.logger.error(`Error clearing messages for session ${sessionId}:`, error);
      return 0;
    }
  }

  /**
   * Get the total message count for user's sessions (for analytics).
   */
  async countMessagesByUser(userId: string): Promise<number> {
    try {
      const sessions = await this.prisma.safeExecute(async () => {
        return await this.prisma.session.findMany({
          where: { userId },
          select: { id: true },
        });
      });
      if (!sessions) return 0;
      let count = 0;
      for (const session of sessions) {
        const conversations = await this.prisma.safeExecute(async () => {
          return await this.prisma.conversation.findMany({
            where: { sessionId: session.id },
            select: { id: true },
          });
        });
        if (!conversations) continue;
        for (const conv of conversations) {
          const msgCount = await this.prisma.safeExecute(async () => {
            return await this.prisma.message.count({
              where: { conversationId: conv.id },
            });
          });
          count += msgCount || 0;
        }
      }
      return count;
    } catch (error) {
      this.logger.error(`Error counting messages for user ${userId}:`, error);
      return 0;
    }
  }
}
