import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ErpLookupSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ErpLookupDetailsQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value!: string;
}

/** "Testar consulta" do construtor: valores digitados para cada parâmetro da tabela. */
export class ErpTableTestDto {
  @IsObject()
  parametros!: Record<string, unknown>;
}

/** Carregamento público: valores dos campos de que a tabela depende, por código do campo. */
export class ErpTableLoadDto {
  @IsObject()
  dependencies!: Record<string, unknown>;
}
