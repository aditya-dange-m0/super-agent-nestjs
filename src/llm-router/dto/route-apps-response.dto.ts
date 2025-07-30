import { ApiProperty } from '@nestjs/swagger';

export class RouteAppsResponseDto {
  @ApiProperty({
    example: ['Google Calendar', 'Gmail'],
    description: 'List of app names identified from the query',
  })
  appNames: string[];

  @ApiProperty({
    example: ['create_event', 'send_email'],
    description: 'List of tool names or actions identified by the router',
  })
  toolNames: string[];

  @ApiProperty({
    example: 'Identified 2 app(s) and 2 necessary tool(s) from top tools.',
    description: 'Descriptive message about the result',
  })
  message?: string;

  @ApiProperty({
    example: 'Internal Server Error',
    description: 'Error message (if any)',
    required: false,
  })
  error?: string;
}
