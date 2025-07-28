import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
