import { ApiProperty } from '@nestjs/swagger';

export class RouteAppsRequestDto {
  @ApiProperty({
    example: 'Schedule a meeting and send email follow-up',
    description: 'User’s natural language query to route to apps/tools',
  })
  userQuery: string;
}
