import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';
import {
  ChatMessage,
  ComprehensiveAnalysis,
} from '../interfaces/chat.interfaces';
import { comprehensiveAnalysisSchema } from '../schemas/analysis.schema';
import { generateObject } from 'ai';
import { ModelProviderService } from '../../common/services/model-provider.service';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly modelProviderService: ModelProviderService, // Add this dependency
  ) {}

  async performComprehensiveAnalysis(
    userQuery: string,
    conversationHistory: ChatMessage[],
    currentSummary: any = null,
  ): Promise<ComprehensiveAnalysis> {
    const startTime = Date.now();

    // Check cache first
    const queryHash = this.generateQueryHash(userQuery, conversationHistory);
    const cached = await this.cacheService.getCachedAnalysis(queryHash);

    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(`Using cached analysis. Duration: ${duration}ms`);
      return cached;
    }

    const contextualInfo = conversationHistory
      .slice(-3)
      .map((msg) => `${msg.role}: ${msg.content.substring(0, 100)}`)
      .join('\n');

    const summaryContext = currentSummary
      ? `Previous Context: ${JSON.stringify(currentSummary, null, 2)}`
      : 'No previous context available.';

    const prompt = this.buildAnalysisPrompt(
      userQuery,
      contextualInfo,
      summaryContext,
    );

    try {
      this.logger.log('Calling Mastra for comprehensive analysis...');
      console.log('[Analysis] Calling LLM for comprehensive analysis...');

      const analysisModel = this.modelProviderService.getAnalysisModel();

      const { object } = await generateObject({
        model: analysisModel, // Use dynamically selected model
        system:
          'You are a comprehensive analysis assistant that provides complete query analysis in a single pass.',
        prompt: prompt,
        schema: comprehensiveAnalysisSchema,
        temperature: 0.1,
        maxTokens: 2000,
      });

      // Cache the result
      await this.cacheService.setCachedAnalysis(queryHash, object);

      const duration = Date.now() - startTime;

      this.logger.log(`Analysis completed in ${duration}ms`, {
        duration,
        confidence: object.confidenceScore,
        steps: object.executionSteps.length,
        apps: object.recommendedApps,
        needsTools: object.requiresToolExecution,
      });
      console.log(
        `[Analysis] Full analysis object: ${JSON.stringify(object, null, 2)}`,
      );

      return object;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Error in analysis after ${duration}ms:`, error);

      return this.getFallbackAnalysis();
    }
  }

  private generateQueryHash(query: string, history: ChatMessage[]): string {
    const historySnippet = history
      .slice(-3)
      .map((m) => m.content.substring(0, 50))
      .join('|');
    const hash = `${query}:${historySnippet}`;
    return Buffer.from(hash).toString('base64');
  }

  private buildAnalysisPrompt(
    userQuery: string,
    contextualInfo: string,
    summaryContext: string,
  ): string {
    return `You are an advanced AI orchestrator that performs comprehensive query analysis in a single pass. Analyze the user's request holistically and provide all necessary information for execution.

${summaryContext}

Recent Conversation Context:
${contextualInfo}

Current Query: "${userQuery}"

Perform a comprehensive analysis covering:

1. **Query Understanding & Confidence**
   - Analyze what the user is asking for
   - Determine clarity and actionability
   - Assign confidence score (0-1)
   - Identify if tools are needed

2. **Execution Planning**
   - Break down into logical steps
   - Identify dependencies and priorities
   - Determine if sequential execution is needed
   - Estimate complexity level

3. **Information Gathering**
   - Identify missing information
   - Generate search queries if needed
   - Determine clarification requirements
   - Assess if defaults can be used

4. **Conversation Summary Update**
   - Update current intent and state
   - Track gathered and missing information
   - Identify key entities and preferences
   - Determine next expected action

5. **Tool & App Recommendations**
   - Recommend relevant apps for execution
   - Prioritize tools based on query requirements
   - Provide reasoning for each recommendation

Provide a complete analysis that enables efficient execution without additional LLM calls.`;
  }

  private getFallbackAnalysis(): ComprehensiveAnalysis {
    return {
      queryAnalysis: 'Basic query analysis - fallback due to error',
      isQueryClear: true,
      confidenceScore: 0.1,
      requiresToolExecution: false,
      executionSteps: [
        {
          stepNumber: 1,
          description: 'Handle user query conversationally (fallback)',
          requiredData: [],
          toolCategory: 'general',
          dependencies: [],
          priority: 'medium' as const,
        },
      ],
      estimatedComplexity: 'low' as const,
      requiresSequentialExecution: false,
      needsInfoGathering: false,
      missingInformation: [],
      searchQueries: [],
      clarificationNeeded: [],
      canProceedWithDefaults: true,
      conversationSummary: {
        currentIntent: 'User interaction (fallback)',
        contextualDetails: {
          gatheredInformation: [],
          missingInformation: [],
          userPreferences: [],
          previousActions: [],
        },
        conversationState: 'information_gathering',
        keyEntities: [],
        nextExpectedAction: 'Continue conversation (fallback)',
        topicShifts: [],
      },
      recommendedApps: [],
      toolPriorities: [],
    };
  }
}
