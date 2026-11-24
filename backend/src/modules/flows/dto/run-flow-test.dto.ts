import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunFlowTestDto {
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, unknown>;

  /** Gatilho por onde o teste entra, num fluxo com vários; ausente = o primeiro. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  entryNodeId?: string;
}
