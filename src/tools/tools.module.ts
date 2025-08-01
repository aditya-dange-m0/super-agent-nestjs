// src/tools/tools.module.ts
import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { PgVectorService } from '../PgVector/pgvector.service'; // Import PineconeService
import { ComposioModule } from '../composio/composio.module'; // Import ComposioModule

@Module({
  imports: [ComposioModule], // Import ComposioModule to make ComposioService available
  controllers: [ToolsController],
  providers: [PgVectorService], // Provide PgVectorService
  exports: [PgVectorService], // Export PgVectorService
})
export class ToolsModule {}
