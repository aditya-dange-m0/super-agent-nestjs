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


@Module({
  imports: [ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigModule available everywhere
      envFilePath: '.env',
    }),ComposioModule, ToolsModule, LlmRouterModule, ChatModule],
  controllers: [AppController, ToolsController],
  providers: [AppService, PineconeService, LlmRouterService],
})
export class AppModule {}