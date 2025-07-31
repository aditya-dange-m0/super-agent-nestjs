import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { UserDbService } from './services/user-db.service';
import { SessionDbService } from './services/session-db.service';
import { ConversationDbService } from './services/conversation-db.service';
import { MessageDbService } from './services/message-db.service';
import { AppConnectionDbService } from './services/app-connection-db.service';
import { EnhancedConversationService } from './services/enhanced-conversation.service';
import { DatabaseIntegrationService } from './services/database-integration.service';

@Module({
  providers: [
    PrismaService,
    CacheService,
    UserDbService,
    SessionDbService,
    ConversationDbService,
    MessageDbService,
    AppConnectionDbService,
    EnhancedConversationService,
    DatabaseIntegrationService,
  ],
  exports: [
    PrismaService,
    CacheService,
    UserDbService,
    SessionDbService,
    ConversationDbService,
    MessageDbService,
    AppConnectionDbService,
    EnhancedConversationService,
    DatabaseIntegrationService,
  ],
})
export class DatabaseModule {}
