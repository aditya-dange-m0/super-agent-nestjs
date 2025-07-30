import { ApiProperty } from '@nestjs/swagger';

export class IngestRequestDto {
  @ApiProperty({
    example: 'GMAIL',
    description: 'The app name to fetch tools for from Composio',
  })
  appName: string;
}
