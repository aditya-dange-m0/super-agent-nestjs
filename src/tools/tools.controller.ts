// src/tools/tools.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PgVectorService } from '../PgVector/pgvector.service';
import { ComposioService } from '../composio/composio.service'; // Assuming ComposioService is in this path
import { ToolsObject } from '../types/types'; // Adjust path as needed
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { IngestRequestDto } from './dto/ingest-request.dto';
import { SearchRequestDto } from './dto/search-request.dto';

// Define DTOs (Data Transfer Objects) for request bodies
interface IngestRequestBody {
  appName: string;
}

interface SearchRequestBody {
  appName: string;
  userQuery: string;
  topK?: number;
}

@ApiTags('Tools')
@Controller('tools') // Base route for all endpoints in this controller
export class ToolsController {
  constructor(
    private readonly pgVectorService: PgVectorService,
    private readonly composioService: ComposioService, // Inject ComposioService
  ) {}

  /**
   * Handles the POST request to /tools/ingest.
   * Fetches tools from Composio and ingests them into Pinecone.
   * @param body The request body containing the appName.
   * @returns A success message or an error.
   */
  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest Composio tools into Pinecone' })
  @ApiBody({ type: IngestRequestDto })
  @ApiResponse({ status: 200, description: 'Successfully ingested tools' })
  @ApiResponse({ status: 400, description: 'Missing appName in request body' })
  @ApiResponse({ status: 500, description: 'Failed to ingest tools' })
  async ingestTools(@Body() body: IngestRequestBody) {
    const { appName } = body;

    if (!appName) {
      throw new BadRequestException('Missing appName in request body.');
    }

    try {
      // 1. Fetch the full tool definitions from Composio using the injected service
      const fullTools = (await this.composioService.getComposioAppTools(
        appName,
      )) as ToolsObject;
      console.log(
        `Fetched ${Object.keys(fullTools).length} tools from Composio for app: ${appName}`,
      );

      // 2. Ingest these tools into Pinecone using the injected service
      await this.pgVectorService.ingestComposioAppTools(
        appName,
        fullTools,
      );

      return { message: `Successfully ingested tools for app: ${appName}` };
    } catch (error) {
      console.error(
        `API Error during tool ingestion for app ${appName}:`,
        error,
      );
      // Re-throw as a NestJS HTTP exception
      throw new InternalServerErrorException('Failed to ingest tools.');
    }
  }

  /**
   * Handles the POST request to /tools/search.
   * Performs a semantic search for tools in Pinecone based on a user query.
   * @param body The request body containing appName, userQuery, and optional topK.
   * @returns An object with relevant tool names or an error.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search tools from Pinecone using semantic search' })
  @ApiBody({ type: SearchRequestDto })
  @ApiResponse({ status: 200, description: 'Successfully found tools' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Failed to search for tools' })
  async searchTools(@Body() body: SearchRequestBody) {
    const { appName, userQuery, topK } = body;

    // Basic validation for required parameters
    if (!appName || !userQuery) {
      throw new BadRequestException(
        'Missing appName or userQuery in request body.',
      );
    }

    // Optional: Validate topK if needed, although PineconeService handles default
    if (topK !== undefined && (typeof topK !== 'number' || topK <= 0)) {
      throw new BadRequestException(
        'Invalid topK parameter. Must be a positive integer.',
      );
    }

    try {
      // Perform semantic search using the injected PineconeService
      const relevantToolNames: string[] =
        await this.pgVectorService.getComposioAppTools(
          appName,
          userQuery,
          topK,
        );

      return {
        relevantTools: relevantToolNames,
        message: `Found ${relevantToolNames.length} relevant tools for app: ${appName}`,
      };
    } catch (error) {
      console.error(`API Error during tool search for app ${appName}:`, error);
      // Re-throw as a NestJS HTTP exception
      throw new InternalServerErrorException('Failed to search for tools.');
    }
  }
}
