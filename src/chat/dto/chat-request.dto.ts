import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessage {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant' | 'system';

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  timestamp?: number;

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
  @IsString()
  @IsNotEmpty()
  userQuery: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessage)
  conversationHistory?: ChatMessage[];

  @IsOptional()
  @IsString()
  sessionId?: string;
}
