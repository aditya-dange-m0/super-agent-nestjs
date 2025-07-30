import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchRequestDto {
  @ApiProperty({
    example: 'GMAIL',
    description: 'The app name to search tools for',
  })
  appName: string;

  @ApiProperty({
    example: 'how to create a new mail',
    description: 'User’s semantic query to search relevant tools',
  })
  userQuery: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Optional limit on number of results (topK)',
  })
  topK?: number;
}
