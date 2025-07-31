// src/PgVector/pgvector.service.ts
import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PgVector } from '@mastra/pg';
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { ToolsObject } from '../types/types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PgVectorService implements OnModuleInit {
  private pgVector: PgVector;
  private readonly logger = new Logger(PgVectorService.name);
  private readonly POSTGRES_CONNECTION_STRING: string;
  private readonly OPENAI_API_KEY: string;
  private readonly indexName: string = 'tools_index';
  private readonly embeddingModel = openai.embedding('text-embedding-3-small');
  private readonly dimension = 1536;

  constructor(private configService: ConfigService) {
    // Load environment variables
    this.POSTGRES_CONNECTION_STRING = this.configService.get<string>(
      'POSTGRES_CONNECTION_STRING',
    )!;
    this.OPENAI_API_KEY = this.configService.get<string>('OPENAI_API_KEY')!;

    // Validate environment variables
    if (!this.POSTGRES_CONNECTION_STRING || !this.OPENAI_API_KEY) {
      throw new Error(
        'Missing environment variables for PGVector or OpenAI. Ensure POSTGRES_CONNECTION_STRING and OPENAI_API_KEY are set.',
      );
    }

    // Initialize PGVector client
    this.pgVector = new PgVector({
      connectionString: this.POSTGRES_CONNECTION_STRING,
    });
  }

  /**
   * NestJS lifecycle hook: Called once the module has been initialized.
   * Ensures the PGVector index is ready when the application starts.
   */
  async onModuleInit() {
    await this.initializePgVectorIndex();
  }

  /**
   * Initializes the PGVector index. Creates it if it doesn't exist.
   * This function is idempotent and safe to call multiple times.
   */
  private async initializePgVectorIndex(): Promise<void> {
    try {
      const indexes = await this.pgVector.listIndexes();
      if (!indexes.includes(this.indexName)) {
        this.logger.log(`Creating PGVector index: ${this.indexName}...`);
        await this.pgVector.createIndex({
          indexName: this.indexName,
          dimension: this.dimension,
          metric: 'cosine',
        });
        this.logger.log(`PGVector index ${this.indexName} created.`);
      } else {
        this.logger.log(`PGVector index ${this.indexName} already exists.`);
      }
    } catch (error) {
      this.logger.error('Error initializing PGVector index:', error);
      throw new InternalServerErrorException(
        'Failed to initialize PGVector index.',
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
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text,
      });
      return embedding;
    } catch (error) {
      this.logger.error('Error generating embedding:', error);
      throw new InternalServerErrorException('Failed to generate embedding.');
    }
  }

  /**
   * Ingests a set of tools for a specific application into PGVector.
   * Each app will have its own namespace through metadata filtering.
   * @param appKey The key representing the application (e.g., "GMAIL").
   * @param tools The object containing tool definitions for the app.
   * @throws InternalServerErrorException if ingestion fails.
   */
  public async ingestComposioAppToolsToPinecone(
    appKey: string,
    tools: ToolsObject,
  ): Promise<void> {
    try {
      await this.initializePgVectorIndex();

      const toolNames = Object.keys(tools);
      const descriptions = toolNames.map(
        (toolName) => `${toolName}: ${tools[toolName].description}`,
      );

      // Batch embed all tool descriptions
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: descriptions,
      });

      // Prepare metadata for each tool
      const metadata = toolNames.map((toolName) => ({
        toolName,
        appKey,
        fullToolJson: JSON.stringify(tools[toolName]), // Store full tool JSON
      }));

      // Use toolName as the vector ID for upsert
      await this.pgVector.upsert({
        indexName: this.indexName,
        vectors: embeddings,
        metadata,
        ids: toolNames,
      });

      this.logger.log(
        `Upserted ${toolNames.length} tools for app ${appKey} into PGVector.`,
      );
    } catch (error) {
      this.logger.error(`Error upserting tools for app ${appKey}:`, error);
      throw new InternalServerErrorException(
        `Failed to ingest tools for app ${appKey}.`,
      );
    }
  }

  /**
   * Retrieves relevant tool names from PGVector based on a natural language query.
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
    try {
      await this.initializePgVectorIndex();

      // Generate embedding for the natural language query
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: naturalLanguageQuery,
      });

      // Query PGVector with appKey filter in metadata
      const results = await this.pgVector.query({
        indexName: this.indexName,
        queryVector: embedding,
        topK,
        filter: { appKey },
        includeVector: false,
      });

      // Extract tool names from metadata
      const relevantToolNames: string[] = results
        .filter((result) => result.metadata && result.metadata.toolName)
        .map((result) => result.metadata!.toolName as string);

      return relevantToolNames;
    } catch (error) {
      this.logger.error(`Error searching PGVector for app ${appKey}:`, error);
      throw new InternalServerErrorException(
        `Failed to search for tools for app ${appKey}.`,
      );
    }
  }
}
