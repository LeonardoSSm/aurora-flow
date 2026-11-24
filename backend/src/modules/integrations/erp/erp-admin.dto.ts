import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { ErpRefreshCredentials } from './erp-auth.types';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const AUTH_TYPES = ['bearer_static', 'oauth2_client', 'basic_login'] as const;

export class CreateErpConnectorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** URL base do ERP (IPs internos aceitos; validado como interno pelo service) */
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+/, { message: 'baseUrl deve começar com http:// ou https://' })
  baseUrl!: string;

  /** Bearer token em plaintext; obrigatório para bearer_static, opcional para outros tipos */
  @IsOptional()
  @IsString()
  bearerToken?: string;

  @IsOptional()
  @IsEnum(AUTH_TYPES)
  authType?: string;

  /** Credenciais de renovação para oauth2_client / basic_login — encriptadas antes de salvar */
  @IsOptional()
  @IsObject()
  refreshCredentials?: ErpRefreshCredentials;

  @IsOptional()
  @IsObject()
  defaultHeaders?: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;
}

export class UpdateErpConnectorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+/, { message: 'baseUrl deve começar com http:// ou https://' })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  bearerToken?: string;

  @IsOptional()
  @IsEnum(AUTH_TYPES)
  authType?: string;

  @IsOptional()
  @IsObject()
  refreshCredentials?: ErpRefreshCredentials;

  @IsOptional()
  @IsObject()
  defaultHeaders?: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;
}

export class CreateErpTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(HTTP_METHODS)
  method!: string;

  @IsString()
  @IsNotEmpty()
  endpointPath!: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(100, { each: true })
  @Max(599, { each: true })
  successStatusCodes?: number[];

  @IsOptional()
  @IsString()
  saveResponseField?: string;
}

export class UpdateErpTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(HTTP_METHODS)
  method?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endpointPath?: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(100, { each: true })
  @Max(599, { each: true })
  successStatusCodes?: number[];

  @IsOptional()
  @IsString()
  saveResponseField?: string;
}

export class QueryErpLogsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  connectorId?: string;
}
