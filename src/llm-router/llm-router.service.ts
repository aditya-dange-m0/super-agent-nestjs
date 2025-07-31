// src/llm-router/llm-router.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod'; // Zod for schema definition and validation
import { ConfigService } from '@nestjs/config';
import {
  getTopToolDescriptionsForApp,
  getAllAvailableAppNames,
} from './top-tools.registry'; // Import from your registry

// Define the Zod schema for the LLM's output
export const llmRoutingSchema = z.object({
  appNames: z.array(z.string()).describe('List of relevant application names.'),
  toolNames: z
    .array(z.string())
    .describe(
      "List of specific tool names that are necessary from those apps' top tools.",
    ),
});

// Infer the TypeScript type from the Zod schema for type safety
export type LLMRoutingResponse = z.infer<typeof llmRoutingSchema>;

@Injectable()
export class LlmRouterService {
  private readonly LLM_MODEL: string = 'gpt-4o-mini'; // Or 'gpt-4o', 'gpt-3.5-turbo', etc.
  private readonly OPENAI_API_KEY: string;

  constructor(private configService: ConfigService) {
    this.OPENAI_API_KEY = this.configService.get<string>('OPENAI_API_KEY')!;
    if (!this.OPENAI_API_KEY) {
      console.error(
        'OPENAI_API_KEY is not set in environment variables. LLM routing will fail.',
      );
      // In a real app, you might throw an error here or handle it gracefully.
    }
  }

  /**
   * Routes a user query to relevant applications and specific top tools using an LLM.
   * @param userQuery The natural language query from the user.
   * @returns A promise that resolves to an object containing relevant app names and tool names.
   * @throws InternalServerErrorException if the LLM call fails.
   */
  public async routeAppsWithLLM(
    userQuery: string,
  ): Promise<LLMRoutingResponse> {
    const availableAppNames = getAllAvailableAppNames();
    // Prepare the context for the LLM, including available apps and their top tools
    const appContext = availableAppNames.map((appName) => ({
      appName: appName,
      topTools: getTopToolDescriptionsForApp(appName),
    }));

    // Construct the prompt for the LLM
    const prompt = `You are an intelligent routing assistant. Your task is to analyze a user's query and identify which applications and *specific tools* from their "top tools" list are absolutely necessary to fulfill the user's request.

    For each relevant application, examine its available "top tools" (provided with descriptions).
    If the user's query can be fulfilled directly by one or more of these "top tools", include only those *specific tool names*.
    If the user's query is relevant to an app but clearly requires a tool *not* in its "top tools" list, or if the intent is too complex for the top tools, then *do not* include any tools for that app.
    If an app is not relevant at all, do not include it in the response.

    Available Apps and Their Top Tools with Descriptions:
    ${JSON.stringify(appContext, null, 2)}

    User Query: "${userQuery}"`;

    try {
      // Use @ai-sdk/openai's generateObject for structured output based on Zod schema
      const { object } = await generateObject({
        model: openai(this.LLM_MODEL), // Pass API key here
        system: 'You are a helpful assistant that provides JSON responses.',
        prompt: prompt,
        schema: llmRoutingSchema, // The Zod schema ensures the output structure
        temperature: 0.1, // Low temperature for more deterministic routing
        maxTokens: 500,
      });

      // Filter to ensure only valid app/tool names are returned based on your registry
      const relevantAppNames = object.appNames.filter((name) =>
        availableAppNames.includes(name),
      );
      const relevantToolNames = object.toolNames.filter((toolName) =>
        availableAppNames.some(
          (appName) => getTopToolDescriptionsForApp(appName)[toolName],
        ),
      );

      console.log(`LLM Routing Results for query "${userQuery}":`, {
        appNames: relevantAppNames,
        toolNames: relevantToolNames,
      });

      return { appNames: relevantAppNames, toolNames: relevantToolNames };
    } catch (error) {
      console.error('Error calling LLM for app routing:', error);
      // Throw a NestJS HTTP exception for consistent error handling
      throw new InternalServerErrorException('Failed to route apps using LLM.');
    }
  }
}
