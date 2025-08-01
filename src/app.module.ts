import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ComposioModule } from './composio/composio.module';
import { ToolsController } from './tools/tools.controller';
import { ToolsModule } from './tools/tools.module';
import { PineconeService } from './pinecone/pinecone.service';
import { LlmRouterModule } from './llm-router/llm-router.module';
import { LlmRouterService } from './llm-router/llm-router.service';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { PgVectorService } from './PgVector/pgvector.service'
import { PgVectorModule } from './PgVector/pgvector.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigModule available everywhere
      envFilePath: '.env',
    }),
    DatabaseModule,
    ComposioModule,
    ToolsModule,
    LlmRouterModule,
    ChatModule,
    PgVectorModule,
  ],
  controllers: [AppController, ToolsController],
  providers: [AppService, LlmRouterService, PgVectorService],
})
export class AppModule {}
