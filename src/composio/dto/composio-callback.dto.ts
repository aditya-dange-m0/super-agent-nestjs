import { IsString, IsNotEmpty } from 'class-validator';

export class ComposioCallbackDto {
  @IsString()
  @IsNotEmpty()
  connectedAccountId: string;
}
