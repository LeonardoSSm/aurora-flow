import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FlowEdgeDto, FlowNodeDto } from './flow-node.dto';

export class UpdateFlowDto {
  @IsUUID()
  @IsOptional()
  formId?: string | null;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes?: FlowNodeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FlowEdgeDto)
  edges?: FlowEdgeDto[];

  @IsObject()
  @IsOptional()
  viewport?: { x: number; y: number; zoom: number } | null;
}
