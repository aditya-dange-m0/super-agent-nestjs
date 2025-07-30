import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponse } from './interfaces/chat.interfaces';
import { PerformanceInterceptor } from '../common/interceptors/performance.interceptor';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Super Agent Chat')
@Controller('super-agent')
@UseInterceptors(PerformanceInterceptor)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Process chat query using Super Agent' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Missing userQuery or userId' })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during chat processing',
  })
  async processChat(
    @Body() chatRequest: ChatRequestDto,
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const { userQuery, userId, conversationHistory, sessionId } = chatRequest;

      this.logger.log(
        `🚀 Chat Request - User: ${userId}, Query: "${userQuery.substring(0, 100)}...", Session: ${sessionId || 'N/A'}`,
      );

      if (!userQuery?.trim() || !userId?.trim()) {
        throw new HttpException(
          'Missing userQuery or userId in request body.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const response = await this.chatService.processChat({
        userQuery,
        userId,
        conversationHistory,
        sessionId,
      });

      const processingTime = Date.now() - startTime;
      this.logger.log(`✅ Request completed in ${processingTime}ms`);

      return response;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`❌ Chat Error after ${processingTime}ms:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'I encountered an error while processing your request. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
