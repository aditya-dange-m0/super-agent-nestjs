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

  @ApiProperty({
    example: '984bf230-6866-45de-b610-a08b61aaa6ef',
    description: 'The user ID associated with the connection',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: 'GMAIL',
    description: 'The app name associated with the connection',
  })
  @IsString()
  @IsNotEmpty()
  appName: string;
}
