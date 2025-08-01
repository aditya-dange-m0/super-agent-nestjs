import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { ModelProviderService } from '../common/services/model-provider.service';
import { AnalysisService } from './services/analysis.service';
import { ToolPreparationService } from './services/tool-preparation.service';
import { ExecutionContextService } from './services/execution-context.service';
import { PgVectorService } from '../PgVector/pgvector.service';
import { LlmRouterService } from '../llm-router/llm-router.service';
import { DatabaseIntegrationService } from '../database/services/database-integration.service';
import {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ComprehensiveAnalysis,
} from './interfaces/chat.interfaces';
import { buildOptimizedPrompt } from './utils/prompt-builder.util';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly maxAgentSteps: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly modelProviderService: ModelProviderService,
    private readonly analysisService: AnalysisService,
    private readonly toolPreparationService: ToolPreparationService,
    private readonly executionContextService: ExecutionContextService,
    private readonly pgVectorService: PgVectorService,
    private readonly llmRouterService: LlmRouterService, // Fixed naming
    private readonly configService: ConfigService,
    private readonly databaseIntegrationService: DatabaseIntegrationService,
  ) {
    this.maxAgentSteps = this.configService.get<number>('MAX_AGENT_STEPS', 8);
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    const { userQuery, userId, conversationHistory, sessionId } = request;
    const startTime = Date.now();

    // Input validation
    if (!userQuery || !userId) {
      this.logger.warn('Missing required fields: userQuery or userId');
      return {
        response: 'Invalid request: missing required information.',
        executedTools: [],
        requiredConnections: [],
        conversationHistory: [],
        analysis: undefined,
      };
    }

    // Config-driven constants
    const HISTORY_LIMIT = this.configService.get<number>(
      'MAX_CONVERSATION_HISTORY',
      50,
    );

    try {
      this.logger.log({
        event: 'Production Chat Request',
        userId: userId?.slice(0, 6) + '...',
        query: userQuery?.substring(0, 40) + '...',
        sessionId: sessionId || 'N/A',
      });

      // Initialize database context
      const dbContext = await this.databaseIntegrationService.initializeContext(
        userId,
        sessionId,
      );

      // Initialize Pinecone - using the lifecycle method from your service
      await this.pgVectorService.onModuleInit();

      // Get conversation history from database
      let existingHistory = conversationHistory;
      if (!existingHistory && dbContext.sessionId) {
        existingHistory =
          await this.databaseIntegrationService.getConversationHistory(
            dbContext.sessionId,
            HISTORY_LIMIT, // Configurable history limit
          );
      }

      // If database fails to return history, throw error (no in-memory fallback)
      if (!existingHistory) {
        this.logger.error('Failed to retrieve conversation history from database.');
        throw new Error('Could not retrieve conversation history. Please try again later.');
      }

      const lastSummary =
        existingHistory.length > 0
          ? existingHistory[existingHistory.length - 1]?.analysis
              ?.conversationSummary
          : null;

      this.logger.log({
        event: 'Existing conversation history',
        length: existingHistory.length,
      });
      if (lastSummary) {
        this.logger.log({
          event: 'Last conversation summary intent',
          intent: lastSummary.currentIntent,
        });
      }

      // Phase 1: Single comprehensive analysis
      this.logger.log({ event: 'Phase 1', phase: 'Comprehensive Analysis' });
      const analysis = await this.analysisService.performComprehensiveAnalysis(
        userQuery,
        existingHistory,
        lastSummary,
      );

      let finalResponse: ChatResponse;

      // Phase 2: Route based on confidence and requirements
      if (analysis.confidenceScore >= 0.8 && analysis.requiresToolExecution) {
        finalResponse = await this.handleHighConfidenceToolExecution(
          request,
          analysis,
          existingHistory,
        );
      } else if (analysis.confidenceScore >= 0.4) {
        finalResponse = await this.handleMediumConfidenceClarification(
          request,
          analysis,
          existingHistory,
        );
      } else {
        finalResponse = await this.handleLowConfidenceConversation(
          request,
          analysis,
          existingHistory,
        );
      }

      // Phase 3: Update conversation history
      await this.updateConversationHistory(request, finalResponse, analysis);

      const processingTime = Date.now() - startTime;
      this.logger.log({
        event: 'Request completed',
        processingTime,
      });

      return finalResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error({
        event: 'API Error',
        processingTime,
        error,
      });
      throw error;
    }
  }

  private async handleHighConfidenceToolExecution(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[],
  ): Promise<ChatResponse> {
    this.logger.log('🔧 High-confidence tool execution path');

    // Get initial tool routing using the correct service method
    const initialToolNames = await this.getInitialToolRouting(
      request.userQuery,
    );

    // Prepare tools
    const toolResult =
      await this.toolPreparationService.prepareToolsForExecution(
        analysis,
        request.userQuery,
        request.userId,
        initialToolNames,
      );

    const hasTools = Object.keys(toolResult.tools).length > 0;
    this.logger.log({
      event: 'Tools prepared',
      hasTools,
      requiredConnections: toolResult.requiredConnections,
    });

    if (hasTools) {
      return await this.executeWithTools(
        request,
        analysis,
        existingHistory,
        toolResult,
      );
    } else {
      return {
        response:
          toolResult.requiredConnections.length > 0
            ? `I need access to ${toolResult.requiredConnections.join(', ')} to help with this request. Please connect these apps first.`
            : "I understand your request but don't have access to the required tools at the moment.",
        executedTools: [],
        requiredConnections: toolResult.requiredConnections,
        conversationHistory: existingHistory,
        analysis,
      };
    }
  }

  private async executeWithTools(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[],
    toolResult: any,
  ): Promise<ChatResponse> {
    const optimizedPrompt = buildOptimizedPrompt(
      request.userQuery,
      analysis,
      existingHistory,
      true,
    );

    this.logger.log({
      event: 'Calling generateText with tools',
    });

    // Use dynamic model selection for chat
    const chatModel = this.modelProviderService.getChatModel();

    const executionResult = await generateText({
      model: chatModel,
      prompt: optimizedPrompt,
      tools: toolResult.tools,
      toolChoice: 'auto',
      temperature: 0.3,
      maxSteps: this.maxAgentSteps,
      maxTokens: 3000,
    });

    // Get tool calls and results from the execution result
    const toolCalls = executionResult.toolCalls || [];
    const toolResults = executionResult.toolResults || [];

    this.logger.log({
      event: 'generateText result',
      toolCalls: toolCalls.length,
      toolResults: toolResults.length,
    });

    // Create a map of toolCallId to result for easy lookup
    const resultMap = new Map();
    toolResults.forEach((result: any) => {
      if (result.toolCallId) {
        resultMap.set(result.toolCallId, result.result);
      }
    });

    // Process tool results - combining calls with their results
    let hadToolFailure = false;
    const failedToolNames: string[] = [];
    const toolExecutionDetails: string[] = [];
    const executedTools: any[] = [];

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        // Get the result for this specific tool call
        const toolCallResult = resultMap.get(toolCall.toolCallId);

        this.logger.log({
          event: 'Tool Execution',
          tool: toolCall.toolName,
          args: toolCall.args,
          result: toolCallResult,
        });

        // Create the executed tool object with the result
        const executedTool = {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          args: toolCall.args,
          result: toolCallResult,
        };

        executedTools.push(executedTool);

        // Check for failures using the result
        if (
          toolCallResult &&
          typeof toolCallResult === 'object' &&
          'error' in toolCallResult
        ) {
          this.logger.error({
            event: 'Tool Execution FAILURE',
            tool: toolCall.toolName,
            error: toolCallResult.error,
          });
          hadToolFailure = true;
          failedToolNames.push(toolCall.toolName);
          toolExecutionDetails.push(
            `${toolCall.toolName} failed: ${toolCallResult.error}`,
          );
        } else if (
          toolCallResult &&
          typeof toolCallResult === 'object' &&
          'success' in toolCallResult &&
          toolCallResult.success === false
        ) {
          this.logger.error({
            event: 'Tool Execution FAILURE',
            tool: toolCall.toolName,
            error: 'Success property is false',
          });
          hadToolFailure = true;
          failedToolNames.push(toolCall.toolName);
          toolExecutionDetails.push(`${toolCall.toolName} failed.`);
        } else {
          this.logger.log({
            event: 'Tool Execution SUCCESS',
            tool: toolCall.toolName,
          });
          toolExecutionDetails.push(`${toolCall.toolName} succeeded.`);
        }

        // Add result to execution context
        this.executionContextService.addStepResult(
          toolCall.toolCallId,
          toolCallResult,
        );
      }
    }

    const responseText = hadToolFailure
      ? `I attempted to complete your request, but encountered issues with the following actions: ${failedToolNames.join(', ')}. Details: ${toolExecutionDetails.join('; ')}. Please check the details for each action.`
      : executionResult.text ||
        'Task completed successfully using specialized tools.';

    return {
      response: responseText,
      executedTools: executedTools.map((tool, idx) => ({
        name: tool.toolName,
        args: tool.args,
        result: tool.result,
        stepNumber: idx + 1,
      })),
      requiredConnections: toolResult.requiredConnections,
      conversationHistory: existingHistory,
      analysis,
    };
  }

  private async handleMediumConfidenceClarification(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[],
  ): Promise<ChatResponse> {
    this.logger.log('❓ Medium-confidence clarification path');

    if (analysis.clarificationNeeded.length > 0) {
      const clarificationText = `I need clarification on:\n\n${analysis.clarificationNeeded
        .map((item, idx) => `${idx + 1}. ${item}`)
        .join('\n')}\n\nPlease provide these details.`;

      return {
        response: clarificationText,
        executedTools: [],
        requiredConnections: [],
        conversationHistory: existingHistory,
        analysis,
      };
    } else {
      const simplePrompt = buildOptimizedPrompt(
        request.userQuery,
        analysis,
        existingHistory,
        false,
      );

      // Use the chat model for simple responses
      const chatModel = this.modelProviderService.getChatModel();

      const result = await generateText({
        model: chatModel,
        prompt: simplePrompt,
        temperature: 0.4,
        maxTokens: 1500,
      });

      return {
        response:
          result.text ||
          "I understand you're asking about your request. Let me help you with that.",
        executedTools: [],
        requiredConnections: [],
        conversationHistory: existingHistory,
        analysis,
      };
    }
  }

  private async handleLowConfidenceConversation(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[],
  ): Promise<ChatResponse> {
    this.logger.log('💬 Low-confidence conversational response path');

    const conversationalPrompt = `You are a helpful AI assistant.

User Query: "${request.userQuery}"
Context: ${analysis.conversationSummary.currentIntent}

Provide a helpful, conversational response. If unclear, ask for clarification politely.`;

    // Use chat model for conversational responses
    const chatModel = this.modelProviderService.getChatModel();

    const result = await generateText({
      model: chatModel,
      prompt: conversationalPrompt,
      temperature: 0.5,
      maxTokens: 1000,
    });

    return {
      response:
        result.text ||
        "I'm here to help! Could you provide more details about what you need?",
      executedTools: [],
      requiredConnections: [],
      conversationHistory: existingHistory,
      analysis,
    };
  }

  private async getInitialToolRouting(userQuery: string): Promise<string[]> {
    try {
      // Using the correct service method name from your LlmRouterService
      const { toolNames } =
        await this.llmRouterService.routeAppsWithLLM(userQuery);
      this.logger.log({
        event: 'Initial routing',
        toolNames,
      });
      return toolNames;
    } catch (error) {
      this.logger.warn({
        event: 'Error during initial routing for tool names',
        error,
      });
      return [];
    }
  }

  private async updateConversationHistory(
    request: ChatRequest,
    response: ChatResponse,
    analysis: ComprehensiveAnalysis,
  ): Promise<void> {
    const userMessage: ChatMessage = {
      role: 'user',
      content: request.userQuery,
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.response,
      timestamp: Date.now(),
      toolCalls: response.executedTools?.map((tool) => ({
        name: tool.name,
        args: tool.args,
        result: tool.result,
        toolCallId: `${tool.name}_${Date.now()}`,
      })),
      analysis,
    };

    // Always try to persist to the database
    try {
      const dbContext = await this.databaseIntegrationService.initializeContext(
        request.userId,
        request.sessionId,
      );
      await this.databaseIntegrationService.completeConversationFlow(
        dbContext,
        request.userQuery,
        response,
        analysis,
      );
      this.logger.log({
        event: 'Saving conversation to database',
      });
    } catch (error) {
      this.logger.error({
        event: 'Error saving conversation to database',
        error,
      });
      throw new Error('Could not save conversation history. Please try again later.');
    }
  }
}

// 1. Request Reception
//    ├── Extract: userQuery, userId, conversationHistory, sessionId
//    ├── Validate: Required fields (userQuery, userId)
//    ├── Initialize: Pinecone index, services, performance monitoring
//    └── Retrieve: Existing conversation history or use provided history

// 2. Comprehensive Analysis Service
//    ├── Cache Check: Query hash-based analysis caching
//    ├── Context Building:
//    │   ├── Recent conversation context (last 3 messages)
//    │   ├── Previous conversation summary
//    │   └── Current query analysis
//    ├── LLM Analysis (generateObject):
//    │   ├── Query Understanding & Confidence (0-1 score)
//    │   ├── Execution Planning (steps, dependencies, complexity)
//    │   ├── Information Gathering (missing info, clarifications)
//    │   ├── Conversation Summary Update (intent, state, entities)
//    │   └── Tool & App Recommendations (prioritized apps/tools)
//    └── Cache Result: Store analysis for future use

// 3. High-Confidence Tool Execution
//    ├── Initial Tool Routing:
//    │   ├── Call /api/route-apps for initial tool identification
//    │   └── Extract specific toolNames from routing response
//    ├── Tool Preparation Service:
//    │   ├── App Prioritization (based on analysis recommendations)
//    │   ├── Connection Validation:
//    │   │   ├── Check user-app connection mapping
//    │   │   ├── Validate connection status (ACTIVE/INITIATED)
//    │   │   └── Cache connection status
//    │   ├── Tool Selection Strategy:
//    │   │   ├── Priority 1: Use specific tools from initial routing
//    │   │   ├── Priority 2: Semantic search via /api/tools/search
//    │   │   └── Cache tool search results
//    │   └── Tool Fetching: Get full tool definitions from Composio
//    ├── Tool Execution:
//    │   ├── Build optimized prompt with execution context
//    │   ├── Execute generateText with tools (maxSteps: 8)
//    │   ├── Process tool results and check for failures
//    │   └── Update execution context with step results
//    └── Response Generation: Success/failure messages with details

// 4. Medium-Confidence Clarification
//    ├── Check Clarification Needs:
//    │   ├── If clarifications needed: Return structured questions
//    │   └── If no clarifications: Generate conversational response
//    ├── Simple LLM Generation:
//    │   ├── Build simplified prompt
//    │   └── Generate response without tools
//    └── Return clarification or conversational response

// 5. Low-Confidence Conversational
//    ├── Conversational Prompt Building
//    ├── Generate helpful response with higher temperature
//    └── Ask for clarification politely

// 6. History Update
//    ├── Create User Message:
//    │   ├── Role: "user"
//    │   ├── Content: userQuery
//    │   └── Timestamp: current time
//    ├── Create Assistant Message:
//    │   ├── Role: "assistant"
//    │   ├── Content: finalResponseText
//    │   ├── ToolCalls: executed tools with results
//    │   └── Analysis: complete analysis object
//    ├── Update Conversation Store:
//    │   ├── Add both messages to history
//    │   ├── Trim history if > MAX_CONVERSATION_HISTORY (10)
//    │   └── Use session-based or user-based keys
//    └── Cache conversation state
