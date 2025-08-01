import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ComposioInitiateDto {
  @ApiProperty({
    example: 'GMAIL',
    description: 'The app name to connect to via Composio',
  })
  @IsString()
  @IsNotEmpty()
  appName: string;

  @ApiProperty({
    example: '984bf230-6866-45de-b610-a08b61aaa6ef',
    description: 'The UUID of User',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
