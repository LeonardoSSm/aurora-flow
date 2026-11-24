import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ENABLED_FLOW_NODE_TYPES } from '../flow-capabilities';

export class FlowNodeDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsIn([...ENABLED_FLOW_NODE_TYPES])
  type!: string;

  @IsObject()
  position!: { x: number; y: number };

  @IsObject()
  data!: Record<string, unknown>;
}

export class FlowEdgeDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsString()
  @IsOptional()
  sourceHandle?: string;

  @IsString()
  @IsNotEmpty()
  target!: string;
}
