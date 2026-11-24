import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ConnectorType } from '../connector.interface';

export class CreateConnectorDto {
  @IsEnum(ConnectorType)
  type!: ConnectorType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  config!: Record<string, unknown>;
}
