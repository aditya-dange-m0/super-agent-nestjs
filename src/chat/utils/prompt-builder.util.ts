import {
  ChatMessage,
  ComprehensiveAnalysis,
} from '../interfaces/chat.interfaces';

export function buildOptimizedPrompt(
  userQuery: string,
  analysis: ComprehensiveAnalysis,
  conversationHistory: ChatMessage[],
  hasTools: boolean,
): string {
  const currentDate = new Date().toISOString().split('T')[0];
  const { conversationSummary, executionSteps, confidenceScore } = analysis;

  let prompt = `You are an advanced AI assistant optimized for efficient execution. Your primary goal is to accurately complete tasks and report their outcomes.

**Context Summary:**
- Date: ${currentDate}
- Query Confidence: ${confidenceScore.toFixed(2)}
- Current Intent: ${conversationSummary.currentIntent}
- Conversation State: ${conversationSummary.conversationState}
- Tools Available: ${hasTools ? 'Yes' : 'No'}

**Execution Plan (${executionSteps.length} steps):**
${executionSteps
  .map((step, i) => `${i + 1}. ${step.description} (${step.priority})`)
  .join('\n')}

**Key Context:**
- Gathered: ${conversationSummary.contextualDetails.gatheredInformation.join(', ') || 'None'}
- Missing: ${conversationSummary.contextualDetails.missingInformation.join(', ') || 'None'}
- Entities: ${conversationSummary.keyEntities.map((e) => `${e.type}:${e.value}`).join(', ') || 'None'}`;

  if (conversationHistory.length > 0) {
    prompt += `\n\n**Recent History:**\n${conversationHistory
      .slice(-2)
      .map(
        (msg) =>
          `${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`,
      )
      .join('\n')}`;
  }

  prompt += `\n\n**Current Query:** "${userQuery}"`;

  if (hasTools) {
    prompt += `\n\n**Tool Execution Strategy:**
- Execute steps systematically.
- Use context from previous steps.
- Provide clear progress updates.
- **Crucially, accurately report the success or failure of each tool execution.** If a tool fails, state what failed and why, and suggest next steps.`;
  }

  prompt += `\n\n**Next Action:** ${conversationSummary.nextExpectedAction}`;

  return prompt;
}
