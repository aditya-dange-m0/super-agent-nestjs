import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ChatMessage {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant' | 'system';

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @Transform(({ value }) => value || Date.now()) // Auto-generate if not provided
  timestamp: number; // Made required to match interface

  @IsOptional()
  toolCalls?: {
    name: string;
    args: any;
    result?: any;
    toolCallId?: string;
  }[];

  @IsOptional()
  analysis?: any; // ComprehensiveAnalysis type
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
