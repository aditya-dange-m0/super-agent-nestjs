import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';
import { ComprehensiveAnalysis } from '../interfaces/chat.interfaces';

export class ToolCall {
  @IsString()
  name: string;

  @IsOptional()
  args: any;

  @IsOptional()
  result?: any;

  @IsOptional()
  toolCallId?: string;
}

export class ChatMessage {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant' | 'system';

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @Transform(({ value }) => value || Date.now())
  timestamp: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCall)
  @ApiHideProperty()
  toolCalls?: ToolCall[];

  @IsOptional()
  @ApiHideProperty()
  analysis?: ComprehensiveAnalysis;
}

export class ChatRequestDto {
  @ApiProperty({
    example: 'What’s the weather today in Pune?',
    description: 'The user’s input query.',
  })
  @IsString()
  @IsNotEmpty()
  userQuery: string;

  @ApiProperty({
    example: 'user_UUID_1234',
    description: 'Unique identifier of the user.',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help you?' },
    ],
    description: 'Optional conversation history for context.',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessage)
  conversationHistory?: ChatMessage[];

  @ApiProperty({
    example: 'session_xyz',
    description: 'Session ID for chat session.',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
