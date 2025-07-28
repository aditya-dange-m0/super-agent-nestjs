import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';
import { ModelProviderService } from '../common/services/model-provider.service';
import { AnalysisService } from './services/analysis.service';
import { ToolPreparationService } from './services/tool-preparation.service';
import { ConversationService } from './services/conversation.service';
import { ExecutionContextService } from './services/execution-context.service';
import { PineconeService } from '../pinecone/pinecone.service';
import { RouteAppsService } from '../route-apps/route-apps.service';
import { 
  ChatRequest, 
  ChatResponse, 
  ChatMessage,
  ComprehensiveAnalysis 
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
    private readonly conversationService: ConversationService,
    private readonly executionContextService: ExecutionContextService,
    private readonly pineconeService: PineconeService,
    private readonly routeAppsService: RouteAppsService,
    private readonly configService: ConfigService,
  ) {
    this.maxAgentSteps = this.configService.get<number>('MAX_AGENT_STEPS', 8);
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    const { userQuery, userId, conversationHistory, sessionId } = request;
    const startTime = Date.now();

    try {
      this.logger.log(`🚀 Production Chat Request - User: ${userId}, Query: "${userQuery}", Session: ${sessionId || 'N/A'}`);

      // Initialize Pinecone
      await this.pineconeService.initializeIndex();

      // Get conversation history
      const existingHistory = conversationHistory || 
        this.conversationService.getHistory(userId, sessionId);
      
      const lastSummary = existingHistory.length > 0
        ? existingHistory[existingHistory.length - 1]?.analysis?.conversationSummary
        : null;

      this.logger.log(`Existing conversation history length: ${existingHistory.length}`);
      if (lastSummary) {
        this.logger.log(`Last conversation summary intent: ${lastSummary.currentIntent}`);
      }

      // Phase 1: Single comprehensive analysis
      this.logger.log('📊 Phase 1: Comprehensive Analysis');
      const analysis = await this.analysisService.performComprehensiveAnalysis(
        userQuery,
        existingHistory,
        lastSummary
      );

      let finalResponse: ChatResponse;

      // Phase 2: Route based on confidence and requirements
      if (analysis.confidenceScore >= 0.8 && analysis.requiresToolExecution) {
        finalResponse = await this.handleHighConfidenceToolExecution(
          request,
          analysis,
          existingHistory
        );
      } else if (analysis.confidenceScore >= 0.4) {
        finalResponse = await this.handleMediumConfidenceClarification(
          request,
          analysis,
          existingHistory
        );
      } else {
        finalResponse = await this.handleLowConfidenceConversation(
          request,
          analysis,
          existingHistory
        );
      }

      // Phase 3: Update conversation history
      await this.updateConversationHistory(request, finalResponse, analysis);

      const processingTime = Date.now() - startTime;
      this.logger.log(`✅ Request completed in ${processingTime}ms`);

      return finalResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`❌ API Error after ${processingTime}ms:`, error);
      throw error;
    }
  }

  private async handleHighConfidenceToolExecution(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[]
  ): Promise<ChatResponse> {
    this.logger.log('🔧 High-confidence tool execution path');

    // Get initial tool routing
    const initialToolNames = await this.getInitialToolRouting(request.userQuery);
    
    // Prepare tools
    const toolResult = await this.toolPreparationService.prepareToolsForExecution(
      analysis,
      request.userQuery,
      request.userId,
      initialToolNames
    );

    const hasTools = Object.keys(toolResult.tools).length > 0;
    this.logger.log(`Tools prepared. Has tools: ${hasTools}. Required connections: ${JSON.stringify(toolResult.requiredConnections)}`);

    if (hasTools) {
      return await this.executeWithTools(
        request,
        analysis,
        existingHistory,
        toolResult
      );
    } else {
      return {
        response: toolResult.requiredConnections.length > 0
          ? `I need access to ${toolResult.requiredConnections.join(', ')} to help with this request. Please connect these apps first.`
          : "I understand your request but don't have access to the required tools at the moment.",
        executedTools: [],
        requiredConnections: toolResult.requiredConnections,
        conversationHistory: existingHistory,
        analysis
      };
    }
  }

  private async executeWithTools(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[],
    toolResult: any
  ): Promise<ChatResponse> {
    const optimizedPrompt = buildOptimizedPrompt(
      request.userQuery,
      analysis,
      existingHistory,
      true
    );

    this.logger.log('Calling generateText with tools...');

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

    const executedTools = executionResult.toolCalls || [];
    this.logger.log(`generateText returned ${executedTools.length} tool calls`);

    // Process tool results
    let hadToolFailure = false;
    let failedToolNames: string[] = [];
    let toolExecutionDetails: string[] = [];

    if (executedTools.length > 0) {
      for (const toolCall of executedTools) {
        this.logger.log(`Tool Execution - Tool: ${toolCall.toolName}, Args: ${JSON.stringify(toolCall.args)}, Result: ${JSON.stringify(toolCall.result)}`);
        
        if (toolCall.result && typeof toolCall.result === 'object' && 'error' in toolCall.result) {
          this.logger.error(`Tool Execution FAILURE for ${toolCall.toolName}:`, toolCall.result.error);
          hadToolFailure = true;
          failedToolNames.push(toolCall.toolName);
          toolExecutionDetails.push(`${toolCall.toolName} failed: ${toolCall.result.error}`);
        } else if (toolCall.result && typeof toolCall.result === 'object' && 'success' in toolCall.result && toolCall.result.success === false) {
          this.logger.error(`Tool Execution FAILURE for ${toolCall.toolName}: Success property is false`);
          hadToolFailure = true;
          failedToolNames.push(toolCall.toolName);
          toolExecutionDetails.push(`${toolCall.toolName} failed.`);
        } else {
          this.logger.log(`Tool Execution SUCCESS for ${toolCall.toolName}`);
          toolExecutionDetails.push(`${toolCall.toolName} succeeded.`);
        }

        // Add result to execution context
        this.executionContextService.addStepResult(toolCall.toolCallId, toolCall.result);
      }
    }

    const responseText = hadToolFailure
      ? `I attempted to complete your request, but encountered issues with the following actions: ${failedToolNames.join(', ')}. Details: ${toolExecutionDetails.join('; ')}. Please check the details for each action.`
      : executionResult.text || "Task completed successfully using specialized tools.";

    return {
      response: responseText,
      executedTools: executedTools.map((tool, idx) => ({
        name: tool.toolName,
        args: tool.args,
        result: tool.result,
        stepNumber: idx + 1
      })),
      requiredConnections: toolResult.requiredConnections,
      conversationHistory: existingHistory,
      analysis
    };
  }

  private async handleMediumConfidenceClarification(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[]
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
        analysis
      };
    } else {
      const simplePrompt = buildOptimizedPrompt(
        request.userQuery,
        analysis,
        existingHistory,
        false
      );

      // Use the default model for simple responses
      const defaultModel = this.modelProviderService.getModel('openai:gpt-4o-mini');

      const result = await generateText({
        model: defaultModel,
        prompt: simplePrompt,
        temperature: 0.4,
        maxTokens: 1500,
      });

      return {
        response: result.text || "I understand you're asking about your request. Let me help you with that.",
        executedTools: [],
        requiredConnections: [],
        conversationHistory: existingHistory,
        analysis
      };
    }
  }

  private async handleLowConfidenceConversation(
    request: ChatRequest,
    analysis: ComprehensiveAnalysis,
    existingHistory: ChatMessage[]
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
      response: result.text || "I'm here to help! Could you provide more details about what you need?",
      executedTools: [],
      requiredConnections: [],
      conversationHistory: existingHistory,
      analysis
    };
  }

  private async getInitialToolRouting(userQuery: string): Promise<string[]> {
    try {
      const { toolNames } = await this.routeAppsService.routeApps(userQuery);
      this.logger.log(`Initial routing identified specific tool names: ${JSON.stringify(toolNames)}`);
      return toolNames;
    } catch (error) {
      this.logger.warn('Error during initial routing for tool names:', error);
      return [];
    }
  }

  private async updateConversationHistory(
    request: ChatRequest,
    response: ChatResponse,
    analysis: ComprehensiveAnalysis
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
      toolCalls: response.executedTools?.map(tool => ({
        name: tool.name,
        args: tool.args,
        result: tool.result,
        toolCallId: `${tool.name}_${Date.now()}`
      })),
      analysis,
    };

    this.conversationService.updateHistory(request.userId, userMessage, request.sessionId);
    this.conversationService.updateHistory(request.userId, assistantMessage, request.sessionId);
  }
}
