import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateSettingDto {
  @ApiProperty({ example: 'FormHub Corp' })
  @IsString()
  value!: string;
}
