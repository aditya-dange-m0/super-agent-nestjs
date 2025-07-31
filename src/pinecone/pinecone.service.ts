// src/pinecone/pinecone.service.ts
import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Pinecone, Index, PineconeRecord } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { ToolMetadata, ToolsObject } from '../types/types'; // Adjust path as needed
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PineconeService implements OnModuleInit {
  private pinecone: Pinecone;
  private openai: OpenAI;
  private readonly PINECONE_API_KEY: string;
  private readonly OPENAI_API_KEY: string;
  private readonly PINECONE_INDEX_NAME: string;
  private readonly EMBEDDING_MODEL: string = 'text-embedding-3-small'; // Recommended OpenAI embedding model

  constructor(private configService: ConfigService) {
    // Load environment variables. In a real NestJS app, consider using @nestjs/config.
    this.PINECONE_API_KEY = this.configService.get<string>('PINECONE_API_KEY')!;
    this.OPENAI_API_KEY = this.configService.get<string>('OPENAI_API_KEY')!;
    this.PINECONE_INDEX_NAME = this.configService.get<string>(
      'PINECONE_INDEX_NAME',
    )!;

    // Validate environment variables
    if (
      !this.PINECONE_API_KEY ||
      !this.OPENAI_API_KEY ||
      !this.PINECONE_INDEX_NAME
    ) {
      throw new Error(
        'Missing environment variables for Pinecone or OpenAI. Ensure PINECONE_API_KEY, OPENAI_API_KEY, and PINECONE_INDEX_NAME are set.',
      );
    }

    // Initialize Pinecone and OpenAI clients
    this.pinecone = new Pinecone({
      apiKey: this.PINECONE_API_KEY,
    });

    this.openai = new OpenAI({
      apiKey: this.OPENAI_API_KEY,
    });
  }
  /**
   * NestJS lifecycle hook: Called once the module has been initialized.
   * Ensures the Pinecone index is ready when the application starts.
   */
  async onModuleInit() {
    await this.initializePineconeIndex();
  }

  /**
   * Initializes the Pinecone index. Creates it if it doesn't exist.
   * This function is idempotent and safe to call multiple times.
   */
  private async initializePineconeIndex(): Promise<void> {
    try {
      const indexList = await this.pinecone.listIndexes();
      if (
        !indexList.indexes?.some(
          (index) => index.name === this.PINECONE_INDEX_NAME,
        )
      ) {
        console.log(`Creating Pinecone index: ${this.PINECONE_INDEX_NAME}...`);
        await this.pinecone.createIndex({
          name: this.PINECONE_INDEX_NAME,
          dimension: 1536, // Dimension for 'text-embedding-3-small'
          metric: 'cosine', // Cosine similarity is common for embeddings
          spec: {
            serverless: {
              cloud: 'aws', // Or 'gcp', 'azure' based on your Pinecone setup
              region: 'us-east-1', // Or your specific region
            },
          },
          waitUntilReady: true,
        });
        console.log(`Pinecone index ${this.PINECONE_INDEX_NAME} created.`);
      } else {
        console.log(
          `Pinecone index ${this.PINECONE_INDEX_NAME} already exists.`,
        );
      }
    } catch (error) {
      console.error('Error initializing Pinecone index:', error);
      throw new InternalServerErrorException(
        'Failed to initialize Pinecone index.',
      );
    }
  }

  /**
   * Generates an embedding for a given text using OpenAI.
   * @param text The text to embed.
   * @returns A promise that resolves to an array of numbers representing the embedding.
   * @throws InternalServerErrorException if embedding generation fails.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new InternalServerErrorException('Failed to generate embedding.');
    }
  }

  /**
   * Ingests a set of tools for a specific application into Pinecone.
   * Each app will have its own namespace.
   * @param appKey The key representing the application (e.g., "GMAIL").
   * @param tools The object containing tool definitions for the app.
   * @throws InternalServerErrorException if ingestion fails.
   */
  public async ingestComposioAppToolsToPinecone(
    appKey: string,
    tools: ToolsObject,
  ): Promise<void> {
    const index = this.pinecone.index<ToolMetadata>(this.PINECONE_INDEX_NAME);
    const records: PineconeRecord<ToolMetadata>[] = [];

    for (const toolName in tools) {
      if (Object.prototype.hasOwnProperty.call(tools, toolName)) {
        const tool = tools[toolName];
        const descriptionToEmbed = `${toolName}: ${tool.description}`; // Combine name and description
        const embedding = await this.generateEmbedding(descriptionToEmbed);

        records.push({
          id: toolName,
          values: embedding,
          metadata: {
            toolName: toolName,
            appKey: appKey,
            // fullToolJson: JSON.stringify(tool), // Uncomment if you want to store full tool JSON
          } as ToolMetadata,
        });
      }
    }

    // Upsert in batches
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      try {
        await index.namespace(appKey).upsert(batch); // Use appKey as namespace
        console.log(
          `Upserted ${batch.length} tools for app ${appKey} into namespace ${appKey}.`,
        );
      } catch (error) {
        console.error(`Error upserting batch for app ${appKey}:`, error);
        throw new InternalServerErrorException(
          `Failed to ingest tools for app ${appKey}.`,
        );
      }
    }
  }

  /**
   * Retrieves relevant tool names from Pinecone based on a natural language query.
   * @param appKey The key representing the application (e.g., "GMAIL").
   * @param naturalLanguageQuery The user's query in natural language.
   * @param topK The number of top relevant tools to retrieve (defaults to 3).
   * @returns A promise that resolves to an array of relevant tool names.
   * @throws InternalServerErrorException if the search fails.
   */
  public async getComposioAppToolsFromPinecone(
    appKey: string,
    naturalLanguageQuery: string,
    topK: number = 3,
  ): Promise<string[]> {
    const index = this.pinecone.index<ToolMetadata>(this.PINECONE_INDEX_NAME);

    try {
      // 1. Generate embedding for the natural language query
      const queryEmbedding = await this.generateEmbedding(naturalLanguageQuery);

      // 2. Query Pinecone within the specific app's namespace
      const queryResponse = await index.namespace(appKey).query({
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: true, // Crucial to get the toolName back
      });

      // 3. Extract relevant tool names from the query results
      const relevantToolNames: string[] = [];
      if (queryResponse.matches) {
        for (const match of queryResponse.matches) {
          if (match.metadata && match.metadata.toolName) {
            relevantToolNames.push(match.metadata.toolName);
          }
        }
      }
      return relevantToolNames;
    } catch (error) {
      console.error(`Error searching Pinecone for app ${appKey}:`, error);
      throw new InternalServerErrorException(
        `Failed to search for tools for app ${appKey}.`,
      );
    }
  }
}
