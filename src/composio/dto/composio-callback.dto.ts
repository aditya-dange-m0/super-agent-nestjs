import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ComposioCallbackDto {
  @ApiProperty({
    example: 'acc_23908fj98sdf923',
    description: 'The connected account ID returned by Composio',
  })
  @IsString()
  @IsNotEmpty()
  connectedAccountId: string;
}
