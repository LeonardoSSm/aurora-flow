import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class SettingUpdateItem {
  @ApiProperty()
  @IsString()
  key!: string;

  @ApiProperty()
  @IsString()
  value!: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({ type: [SettingUpdateItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingUpdateItem)
  updates!: SettingUpdateItem[];
}
