import { Injectable, Logger } from '@nestjs/common';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export const supportedModels = [
  'openai:gpt-4o-mini',
  'google:gemini-2.0-flash',
  'google:gemini-2.5-flash-lite-preview-06-17',
  'google:gemini-2.0-flash-lite-001',
] as const;

export type SupportedModel = (typeof supportedModels)[number];

@Injectable()
export class ModelProviderService {
  private readonly logger = new Logger(ModelProviderService.name);
  private readonly googleProvider;
  private readonly openaiProvider;
  private readonly openrouterProvider;

  constructor(private readonly configService: ConfigService) {
    this.googleProvider = createGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
    });

    this.openaiProvider = createOpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.openrouterProvider = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }

  getModelProvider(modelIdentifier: SupportedModel): LanguageModel {
    const [platform, modelName] = modelIdentifier.split(':');

    switch (platform) {
      case 'openai':
        return this.openaiProvider(modelName as any);
      case 'google':
        return this.googleProvider(modelName as any);
      case 'openrouter':
        return this.openrouterProvider(modelName as any);
      default:
        this.logger.warn(
          `Unsupported model platform: ${platform}. Defaulting to gemini-2.0-flash.`,
        );
        return this.googleProvider('gemini-2.0-flash' as any);
    }
  }

  // Convenience methods
  getChatModel(): LanguageModel {
    const model = this.configService.get<SupportedModel>(
      'CHAT_MODEL',
      'openai:gpt-4o-mini',
    );
    return this.getModelProvider(model);
  }

  getAnalysisModel(): LanguageModel {
    const model = this.configService.get<SupportedModel>(
      'ANALYSIS_MODEL',
      'google:gemini-2.0-flash',
    );
    return this.getModelProvider(model);
  }
}
