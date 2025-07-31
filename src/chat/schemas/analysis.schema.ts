import { z } from 'zod';

export const comprehensiveAnalysisSchema = z.object({
  queryAnalysis: z.string(),
  isQueryClear: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  requiresToolExecution: z.boolean(),

  executionSteps: z.array(
    z.object({
      stepNumber: z.number(),
      description: z.string(),
      requiredData: z.array(z.string()),
      appName: z.string().optional(),
      toolCategory: z.string(),
      dependencies: z.array(z.number()),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    }),
  ),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  requiresSequentialExecution: z.boolean(),

  needsInfoGathering: z.boolean(),
  missingInformation: z.array(z.string()),
  searchQueries: z.array(z.string()),
  clarificationNeeded: z.array(z.string()),
  canProceedWithDefaults: z.boolean(),

  conversationSummary: z.object({
    currentIntent: z.string(),
    contextualDetails: z.object({
      gatheredInformation: z.array(z.string()),
      missingInformation: z.array(z.string()),
      userPreferences: z.array(z.string()),
      previousActions: z.array(z.string()),
    }),
    conversationState: z.enum([
      'information_gathering',
      'ready_to_execute',
      'executed',
      'clarification_needed',
      'completed',
    ]),
    keyEntities: z.array(
      z.object({
        type: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    ),
    nextExpectedAction: z.string(),
    topicShifts: z.array(z.string()),
  }),

  recommendedApps: z.array(z.string()),
  toolPriorities: z.array(
    z.object({
      appName: z.string(),
      priority: z.number().min(1).max(10),
      reasoning: z.string(),
    }),
  ),
});
