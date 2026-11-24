import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @IsString()
  @IsIn(['ios', 'android'])
  platform!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  deviceId?: string;
}

export class UnregisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;
}
