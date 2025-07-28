import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessage } from '../interfaces/chat.interfaces';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly conversationStore = new Map<string, ChatMessage[]>();
  private readonly maxConversationHistory: number;

  constructor(private readonly configService: ConfigService) {
    this.maxConversationHistory = this.configService.get<number>('MAX_CONVERSATION_HISTORY', 10);
  }

  private getConversationKey(userId: string, sessionId?: string): string {
    return sessionId ? `${userId}:${sessionId}` : userId;
  }

  getHistory(userId: string, sessionId?: string): ChatMessage[] {
    const key = this.getConversationKey(userId, sessionId);
    this.logger.log(`Retrieving history for key: ${key}`);
    return this.conversationStore.get(key) || [];
  }

  updateHistory(userId: string, message: ChatMessage, sessionId?: string): void {
    const key = this.getConversationKey(userId, sessionId);
    const history = this.conversationStore.get(key) || [];
    history.push(message);

    if (history.length > this.maxConversationHistory) {
      const removedCount = history.splice(0, history.length - this.maxConversationHistory).length;
      this.logger.log(`Trimmed history for key ${key}, removed ${removedCount} messages.`);
    }

    this.conversationStore.set(key, history);
    this.logger.log(`Updated history for key ${key}, current length: ${history.length}`);
  }

  clearHistory(userId: string, sessionId?: string): void {
    const key = this.getConversationKey(userId, sessionId);
    this.conversationStore.delete(key);
    this.logger.log(`Cleared history for key: ${key}`);
  }
}
