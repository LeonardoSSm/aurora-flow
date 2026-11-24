import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AiCatalogService } from './ai-catalog.service';
import type { BlueprintCheck, ProcessBlueprint } from './blueprint/process-blueprint.types';
import { LopsAiAuthGuard } from './lops-ai-auth.guard';
import { ProcessBuilderService, type ProcessCreationResult } from './process-builder.service';

/**
 * Processos pela LOPS IA: listar e ler (como exemplo), conferir e criar o processo inteiro numa
 * chamada. O corpo é o processo cru (sem DTO): a conferência própria devolve todos os erros de
 * uma vez, com o caminho, em vez de parar no primeiro.
 */
@Controller('ai/processes')
@UseGuards(LopsAiAuthGuard, PermissionsGuard)
@RequirePermission('ai.copilot.use')
export class AiProcessesController {
  constructor(
    private readonly builder: ProcessBuilderService,
    private readonly catalog: AiCatalogService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('search') search?: string): ReturnType<AiCatalogService['processes']> {
    return this.catalog.processes(user, search);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<ProcessBlueprint> {
    return this.builder.exportProcess(id, user);
  }

  @Post('validate')
  @HttpCode(200)
  validate(@Body() body: unknown, @CurrentUser() user: JwtPayload): Promise<BlueprintCheck> {
    return this.builder.check(body, user);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Query('dryRun') dryRun?: string,
  ): Promise<ProcessCreationResult | (BlueprintCheck & { dryRun: true })> {
    const isDryRun = dryRun === 'true' || dryRun === '1';
    const key = (idempotencyKey ?? '').trim();
    if (!isDryRun && (key.length < 8 || key.length > 120)) {
      throw new BadRequestException(
        'Envie o cabeçalho Idempotency-Key (8 a 120 caracteres), o mesmo em todas as tentativas desta criação.',
      );
    }
    return this.builder.create(body, user, { idempotencyKey: key, dryRun: isDryRun });
  }
}
