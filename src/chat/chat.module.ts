import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AnalysisService } from './services/analysis.service';
import { ToolPreparationService } from './services/tool-preparation.service';
import { ConversationService } from './services/conversation.service';
import { ExecutionContextService } from './services/execution-context.service';
import { CacheService } from '../cache/cache.service';
import { ModelProviderService } from '../common/services/model-provider.service';
import { PineconeService } from '../pinecone/pinecone.service';
import { ComposioModule } from '../composio/composio.module';
import { ToolsModule } from '../tools/tools.module';
import { LlmRouterModule } from '../llm-router/llm-router.module';

@Module({
  imports: [
    ComposioModule,
    ToolsModule,
    LlmRouterModule,
  ],
  controllers: [ChatController],
  providers: [
    PineconeService,
    ChatService,
    AnalysisService,
    ToolPreparationService,
    ConversationService,
    ExecutionContextService,
    CacheService,
    ModelProviderService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
