// src/tools/tools.module.ts
import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { PineconeService } from '../pinecone/pinecone.service'; // Import PineconeService
import { ComposioModule } from '../composio/composio.module'; // Import ComposioModule

@Module({
  imports: [ComposioModule], // Import ComposioModule to make ComposioService available
  controllers: [ToolsController],
  providers: [PineconeService], // Provide PineconeService
  exports: [PineconeService], // Export PineconeService
})
export class ToolsModule {}