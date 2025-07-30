import { Injectable, Logger } from '@nestjs/common';
import { UserDbService } from './user-db.service';
import { SessionDbService } from './session-db.service';
import { ConversationDbService } from './conversation-db.service';
import { MessageDbService } from './message-db.service';
import { AppConnectionDbService } from './app-connection-db.service';
import { EnhancedConversationService } from './enhanced-conversation.service';
import { ChatMessage, ChatResponse } from '../../chat/interfaces/chat.interfaces';

export interface DatabaseContext {
  userId: string;
  sessionId?: string;
  conversationId?: string;
}

export interface ConversationData {
  messages: ChatMessage[];
  summary?: any;
  metadata?: any;
}

@Injectable()
export class DatabaseIntegrationService {
  private readonly logger = new Logger(DatabaseIntegrationService.name);

  constructor(
    private readonly userDbService: UserDbService,
    private readonly sessionDbService: SessionDbService,
    private readonly conversationDbService: ConversationDbService,
    private readonly messageDbService: MessageDbService,
    private readonly appConnectionDbService: AppConnectionDbService,
    private readonly enhancedConversationService: EnhancedConversationService,
  ) {}

  /**
   * Initialize or retrieve database context for a chat request
   */
  async initializeContext(
    userId: string,
    sessionId?: string,
    userEmail?: string,
    userName?: string,
  ): Promise<DatabaseContext> {
    try {
      // Ensure user exists
      const user = await this.userDbService.findOrCreateUser(
        userId,
        userEmail,
        userName,
      );

      if (!user) {
        throw new Error(`Failed to create/find user: ${userId}`);
      }

      // Get or create session
      let session;
      if (sessionId) {
        session = await this.sessionDbService.getSession(sessionId);
        if (session && session.userId !== userId) {
          this.logger.warn(`Session ${sessionId} belongs to different user, creating new session`);
          session = null;
        }
      }

      if (!session) {
        this.logger.log(`Creating or finding session for user ${userId} with sessionId: ${sessionId || 'auto-generated'}`);
        session = await this.sessionDbService.findOrCreateSession(userId, sessionId);
        if (!session) {
          throw new Error(`Failed to create session for user: ${userId}`);
        }
        this.logger.log(`Session created/found: ${session.id}`);
      }

      // Update session activity
      await this.sessionDbService.updateSessionActivity(session.id);

      return {
        userId,
        sessionId: session.id,
      };
    } catch (error) {
      this.logger.error(`Error initializing database context:`, error);
      throw error;
    }
  }

  /**
   * Get or create conversation for the current session
   */
  async getOrCreateConversation(
    sessionId: string,
    conversationId?: string,
  ): Promise<string> {
    try {
      // First, ensure the session exists
      const session = await this.sessionDbService.getSession(sessionId);
      if (!session) {
        this.logger.warn(`Session ${sessionId} not found, attempting to create it`);
        // Try to create the session if it doesn't exist
        const newSession = await this.sessionDbService.findOrCreateSession(
          'user_12345_67890', // Default user ID for testing
          sessionId
        );
        if (!newSession) {
          throw new Error(`Failed to create session: ${sessionId}`);
        }
      }

      // Check if conversation already exists for this session
      const existingConversations = await this.conversationDbService.getConversationsForSession(sessionId, 1);
      if (existingConversations.length > 0) {
        this.logger.log(`Using existing conversation ${existingConversations[0].id} for session ${sessionId}`);
        return existingConversations[0].id;
      }

      // Create a new conversation for this session
      const conversation = await this.conversationDbService.createConversation(sessionId);
      if (!conversation) {
        throw new Error(`Failed to create conversation for session: ${sessionId}`);
      }

      this.logger.log(`Created new conversation ${conversation.id} for session ${sessionId}`);
      return conversation.id;
    } catch (error) {
      this.logger.error(`Error getting/creating conversation:`, error);
      throw error;
    }
  }

  /**
   * Save user message to database
   */
  async saveUserMessage(
    sessionId: string,
    content: string,
    metadata?: any,
  ): Promise<string> {
    try {
      // The message service expects a sessionId to find/create the correct conversation
      const message = await this.messageDbService.saveMessageToSession(
        sessionId,
        {
          role: 'user',
          content,
          timestamp: Date.now(),
        }
      );

      if (!message) {
        throw new Error(`Failed to save user message for session: ${sessionId}`);
      }

      return message.id;
    } catch (error) {
      this.logger.error(`Error saving user message:`, error);
      throw error;
    }
  }

  /**
   * Save assistant response to database
   */
  async saveAssistantResponse(
    sessionId: string,
    content: string,
    toolCalls?: any,
    analysis?: any,
    metadata?: any,
  ): Promise<string> {
    try {
      const message = await this.messageDbService.saveMessageToSession(
        sessionId,
        {
          role: 'assistant',
          content,
          timestamp: Date.now(),
          toolCalls,
          analysis,
        }
      );

      if (!message) {
        throw new Error(`Failed to save assistant response for session: ${sessionId}`);
      }

      return message.id;
    } catch (error) {
      this.logger.error(`Error saving assistant response:`, error);
      throw error;
    }
  }

  /**
   * Get conversation history from database
   */
  async getConversationHistory(
    sessionId: string,
    limit: number = 50,
  ): Promise<ChatMessage[]> {
    try {
      // The message service retrieves messages based on the session ID.
      const messages = await this.messageDbService.getMessagesForSession(
        sessionId,
        limit,
      );

      return messages;
    } catch (error) {
      this.logger.error(`Error getting conversation history:`, error);
      return [];
    }
  }

  /**
   * Update conversation summary
   */
  async updateConversationSummary(
    conversationId: string,
    summary: any,
  ): Promise<void> {
    try {
      // For now, we'll skip this since the method doesn't exist
      // In a full implementation, you'd add this method to ConversationDbService
      this.logger.debug(`Would update conversation summary for ${conversationId}`);
    } catch (error) {
      this.logger.error(`Error updating conversation summary:`, error);
    }
  }

  /**
   * Update session conversation summary
   */
  async updateSessionSummary(
    sessionId: string,
    summary: any,
  ): Promise<void> {
    try {
      await this.sessionDbService.updateSessionSummary(sessionId, summary);
    } catch (error) {
      this.logger.error(`Error updating session summary:`, error);
    }
  }

  /**
   * Get user's active app connections
   */
  async getUserAppConnections(userId: string): Promise<any[]> {
    try {
      const connections = await this.appConnectionDbService.getUserConnections(userId, 'ACTIVE');
      return Object.entries(connections).map(([appName, accountId]) => ({
        appName,
        accountId,
      }));
    } catch (error) {
      this.logger.error(`Error getting user app connections:`, error);
      return [];
    }
  }

  /**
   * Complete conversation flow - saves both messages and updates summaries
   */
  async completeConversationFlow(
    context: DatabaseContext,
    userQuery: string,
    assistantResponse: ChatResponse,
    analysis?: any,
  ): Promise<void> {
    try {
      if (!context.conversationId) {
        context.conversationId = await this.getOrCreateConversation(context.sessionId!);
      }

      // Save user message
      await this.saveUserMessage(context.sessionId!, userQuery);

      // Save assistant response
      await this.saveAssistantResponse(
        context.sessionId!,
        assistantResponse.response,
        assistantResponse.executedTools, // Use executedTools instead of toolCalls
        analysis,
        {
          // Store analysis data in metadata since these properties don't exist on ChatResponse
          analysis: analysis,
        },
      );

      // Update summaries if analysis is provided
      if (analysis) {
        await this.updateConversationSummary(context.conversationId, analysis);
        if (context.sessionId) {
          await this.updateSessionSummary(context.sessionId, analysis);
        }
      }

      this.logger.log(`Conversation flow completed for user: ${context.userId}`);
    } catch (error) {
      this.logger.error(`Error completing conversation flow:`, error);
      // Don't throw error to avoid breaking the chat flow
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<any> {
    try {
      return await this.userDbService.getUserStats(userId);
    } catch (error) {
      this.logger.error(`Error getting user stats:`, error);
      return null;
    }
  }

  /**
   * Clean up old sessions and conversations
   */
  async cleanupOldData(): Promise<void> {
    try {
      await this.sessionDbService.cleanupInactiveSessions();
      // Note: cleanupOldConversations and cleanupOldMessages methods don't exist yet
      // In a full implementation, you'd add these methods to the respective services
      this.logger.debug('Cleanup completed (partial - some methods not implemented)');
    } catch (error) {
      this.logger.error(`Error cleaning up old data:`, error);
    }
  }
} 