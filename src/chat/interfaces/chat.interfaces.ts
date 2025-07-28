export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: {
    name: string;
    args: any;
    result?: any;
    toolCallId?: string;
  }[];
  analysis?: ComprehensiveAnalysis;
}

export interface ChatRequest {
  userQuery: string;
  userId: string;
  conversationHistory?: ChatMessage[];
  sessionId?: string;
}

export interface ChatResponse {
  response: string;
  executedTools?: {
    name: string;
    args: any;
    result?: any;
    stepNumber?: number;
  }[];
  requiredConnections?: string[];
  conversationHistory?: ChatMessage[];
  analysis?: ComprehensiveAnalysis;
  error?: string;
}

export interface ComprehensiveAnalysis {
  queryAnalysis: string;
  isQueryClear: boolean;
  confidenceScore: number;
  requiresToolExecution: boolean;
  executionSteps: ExecutionStep[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiresSequentialExecution: boolean;
  needsInfoGathering: boolean;
  missingInformation: string[];
  searchQueries: string[];
  clarificationNeeded: string[];
  canProceedWithDefaults: boolean;
  conversationSummary: ConversationSummary;
  recommendedApps: string[];
  toolPriorities: ToolPriority[];
}

export interface ExecutionStep {
  stepNumber: number;
  description: string;
  requiredData: string[];
  appName?: string;
  toolCategory: string;
  dependencies: number[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ConversationSummary {
  currentIntent: string;
  contextualDetails: {
    gatheredInformation: string[];
    missingInformation: string[];
    userPreferences: string[];
    previousActions: string[];
  };
  conversationState: 'information_gathering' | 'ready_to_execute' | 'executed' | 'clarification_needed' | 'completed';
  keyEntities: {
    type: string;
    value: string;
    confidence: number;
  }[];
  nextExpectedAction: string;
  topicShifts: string[];
}

export interface ToolPriority {
  appName: string;
  priority: number;
  reasoning: string;
}
