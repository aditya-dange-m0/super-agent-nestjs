// src/llm-router/llm-router.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LlmRouterService, LLMRoutingResponse } from './llm-router.service'; // Import the service and its response type

import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RouteAppsRequestDto } from './dto/route-apps-request.dto';
import { RouteAppsResponseDto } from './dto/route-apps-response.dto';

// Define DTO for the request body
interface RouteAppsRequestBody {
  userQuery: string;
}

// Define DTO for the API response
interface RouteAppsAPIResponse extends LLMRoutingResponse {
  message?: string;
  error?: string;
}

@ApiTags('LLM Router')
@Controller('route-apps') // Base route for this controller
export class LlmRouterController {
  constructor(private readonly llmRouterService: LlmRouterService) {}

  /**
   * Handles the POST request to /route-apps.
   * Routes a user query to relevant applications and specific top tools using an LLM.
   * @param body The request body containing the userQuery.
   * @returns An object with relevant app names and tool names, plus a message.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Route user query to apps and tools via LLM' })
  @ApiBody({ type: RouteAppsRequestDto })
  @ApiResponse({ status: 200, type: RouteAppsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Missing userQuery in request body',
  })
  @ApiResponse({ status: 500, description: 'Failed to route apps' })
  async routeApps(
    @Body() body: RouteAppsRequestBody,
  ): Promise<RouteAppsAPIResponse> {
    const { userQuery } = body;

    if (!userQuery) {
      throw new BadRequestException('Missing userQuery in request body.');
    }

    try {
      // Call the LLM routing service
      const { appNames, toolNames } =
        await this.llmRouterService.routeAppsWithLLM(userQuery);

      return {
        appNames: appNames,
        toolNames: toolNames,
        message: `Identified ${appNames.length} app(s) and ${toolNames.length} necessary tool(s) from top tools.`,
      };
    } catch (error) {
      console.error('API Error during app routing:', error);
      // Re-throw as a NestJS HTTP exception for consistent error handling
      throw new InternalServerErrorException('Failed to route apps.');
    }
  }
}
