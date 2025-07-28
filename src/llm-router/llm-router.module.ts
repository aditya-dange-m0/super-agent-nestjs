// src/llm-router/llm-router.module.ts
import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm-router.service';
import { LlmRouterController } from './llm-router.controller';

@Module({
  providers: [LlmRouterService], // Provide the LLM Router Service
  controllers: [LlmRouterController], // Include the LLM Router Controller
  exports: [LlmRouterService], // Export the service if other modules need to inject it
})
export class LlmRouterModule {}
