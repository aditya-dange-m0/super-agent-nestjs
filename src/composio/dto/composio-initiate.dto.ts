import { IsString, IsNotEmpty } from 'class-validator';

export class ComposioInitiateDto {
  @IsString()
  @IsNotEmpty()
  appName: string;

  @IsString()
  userId?: string;
}
