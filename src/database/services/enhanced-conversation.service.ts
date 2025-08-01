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
   * Get conversation history for a user/session from persistent DB only.
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
      // Fetch last N messages from DB
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
      return [];
    } catch (error) {
      this.logger.error(`[ConvSvc] Error fetching history:`, error);
      return [];
    }
  }

  /**
   * Save a message for a user/session in persistent DB only.
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
      // Save to DB
      await this.messageDbService.saveMessageToSession(session.id, message);
    } catch (error) {
      this.logger.error(`[ConvSvc] Error updating history:`, error);
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
}
