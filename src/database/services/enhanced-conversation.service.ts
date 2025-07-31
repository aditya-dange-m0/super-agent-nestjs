import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatMessage,
  ComprehensiveAnalysis,
} from '../../chat/interfaces/chat.interfaces';

import { SessionDbService } from '../../database/services/session-db.service';
import { MessageDbService } from '../../database/services/message-db.service';
import { UserDbService } from '../../database/services/user-db.service';

@Injectable()
export class EnhancedConversationService {
  private readonly logger = new Logger(EnhancedConversationService.name);
  private readonly conversationStore = new Map<string, ChatMessage[]>(); // In-memory backup
  private readonly maxConversationHistory: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionDbService: SessionDbService,
    private readonly messageDbService: MessageDbService,
    private readonly userDbService: UserDbService,
  ) {
    this.maxConversationHistory = this.configService.get<number>(
      'MAX_CONVERSATION_HISTORY',
      10,
    );
  }

  /**
   * Get conversation history for a user/session.
   * Automatically loads from DB and falls back to memory if needed.
   */
  async getHistory(userId: string, sessionId?: string): Promise<ChatMessage[]> {
    try {
      await this.userDbService.findOrCreateUser(userId);

      // Find or create session
      const session = await this.sessionDbService.findOrCreateSession(
        userId,
        sessionId,
      );
      if (!session) {
        this.logger.warn(`[ConvSvc] No session found for user ${userId}`);
        return [];
      }

      // Fetch last N messages from DB, fallback to memory if DB unavailable
      const dbMessages = await this.messageDbService.getMessagesForSession(
        session.id,
        this.maxConversationHistory,
      );
      if (dbMessages.length > 0) {
        this.logger.log(
          `[ConvSvc] Got ${dbMessages.length} messages from DB for session ${session.id}`,
        );
        return dbMessages;
      }

      // In-memory fallback
      const key = this.getConversationKey(userId, sessionId);
      const memMessages = this.conversationStore.get(key) || [];
      this.logger.warn(
        `[ConvSvc] Using in-memory fallback, ${memMessages.length} messages for key ${key}`,
      );
      return memMessages;
    } catch (error) {
      this.logger.error(`[ConvSvc] Error fetching history:`, error);
      const key = this.getConversationKey(userId, sessionId);
      return this.conversationStore.get(key) || [];
    }
  }

  /**
   * Save a message for a user/session (both DB and memory for resiliency).
   */
  async updateHistory(
    userId: string,
    message: ChatMessage,
    sessionId?: string,
  ): Promise<void> {
    try {
      await this.userDbService.findOrCreateUser(userId);
      const session = await this.sessionDbService.findOrCreateSession(
        userId,
        sessionId,
      );

      if (!session) {
        this.logger.warn(`[ConvSvc] No session found for user ${userId}`);
        return;
      }

      // Save to DB (async, errors are logged but non-fatal)
      this.messageDbService
        .saveMessageToSession(session.id, message)
        .catch((err) => {
          this.logger.warn(
            `[ConvSvc] DB save failed, will use in-memory as fallback (non-fatal):`,
            err,
          );
        });

      // Always backup in memory (for zero-downtime/chat recovery)
      const key = this.getConversationKey(userId, sessionId);
      const history = this.conversationStore.get(key) || [];
      history.push(message);
      // Enforce max length
      if (history.length > this.maxConversationHistory) {
        history.splice(0, history.length - this.maxConversationHistory);
      }
      this.conversationStore.set(key, history);
    } catch (error) {
      this.logger.error(`[ConvSvc] Error updating history:`, error);
      // In-memory fallback for worst-case
      const key = this.getConversationKey(userId, sessionId);
      const history = this.conversationStore.get(key) || [];
      history.push(message);
      this.conversationStore.set(key, history);
    }
  }

  /**
   * Store the per-session conversation summary (dynamic memory) in DB.
   */
  async updateSessionSummary(
    userId: string,
    sessionId: string,
    analysis: ComprehensiveAnalysis,
  ): Promise<void> {
    try {
      await this.sessionDbService.updateSessionSummary(sessionId, analysis);
    } catch (error) {
      this.logger.error(`[ConvSvc] Error updating session summary:`, error);
    }
  }

  /**
   * Retrieve per-session summary for context injection.
   */
  async getSessionSummary(
    sessionId: string,
  ): Promise<ComprehensiveAnalysis | null> {
    try {
      return await this.sessionDbService.getSessionSummary(sessionId);
    } catch (error) {
      this.logger.error(`[ConvSvc] Error getting session summary:`, error);
      return null;
    }
  }

  /**
   * Clear conversation history from memory fallback (rarely needed).
   */
  clearHistory(userId: string, sessionId?: string): void {
    const key = this.getConversationKey(userId, sessionId);
    this.conversationStore.delete(key);
    this.logger.log(`[ConvSvc] Cleared in-memory history for key ${key}`);
  }

  private getConversationKey(userId: string, sessionId?: string): string {
    return sessionId ? `${userId}:${sessionId}` : userId;
  }
}
