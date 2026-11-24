import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ITEM_LIST_COLUMN_COLORS,
  ITEM_LIST_COLUMN_TYPES,
  MAX_COLUMN_OPTIONS,
  MAX_COLUMNS,
  type ItemListColumnColor,
  type ItemListColumnType,
} from '../item-list-columns';

/** Id curto gerado pela tela para colunas e opções: é ele que liga o valor do item à coluna. */
const LOCAL_ID = /^[A-Za-z0-9_-]{1,40}$/;

export class ItemListColumnOptionDto {
  @Matches(LOCAL_ID)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsIn(ITEM_LIST_COLUMN_COLORS)
  color!: ItemListColumnColor;
}

export class ItemListColumnDto {
  @Matches(LOCAL_ID)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsIn(ITEM_LIST_COLUMN_TYPES)
  type!: ItemListColumnType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COLUMN_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => ItemListColumnOptionDto)
  options?: ItemListColumnOptionDto[];
}

export class ItemListItemDto {
  /** Item já salvo: manter o id mantém as respostas apontando para ele. Sem id = item novo. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Valor de cada coluna própria, pelo id da coluna. Sem `values` = mantém os que o item já tem. */
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;
}

export class SaveItemListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Colunas próprias da lista. Sem `columns` = mantém as que a lista já tem. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COLUMNS)
  @ValidateNested({ each: true })
  @Type(() => ItemListColumnDto)
  columns?: ItemListColumnDto[];

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ItemListItemDto)
  items!: ItemListItemDto[];
}

export class SetItemListActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
