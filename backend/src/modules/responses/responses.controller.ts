import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubmissionEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { SubmitProgressDto } from './dto/submit-progress.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { ResponsesService } from './responses.service';
import { SubmissionProgressService } from './submission-progress.service';

@ApiTags('responses')
@Controller('responses')
export class ResponsesController {
  constructor(
    private readonly responsesService: ResponsesService,
    private readonly submissionProgressService: SubmissionProgressService,
  ) {}

  /**
   * Public endpoint — no authentication required.
   * Fired once per section transition while filling out a form, to let
   * "on_section_reached" automations fire before the final submission.
   * Looser rate-limit than /submit since it's hit multiple times per fill-out.
   */
  @Post('progress')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Registrar progresso de preenchimento (público)' })
  progress(@Body() payload: SubmitProgressDto): Promise<{ progressId: string }> {
    return this.submissionProgressService.recordProgress(payload);
  }

  /**
   * Public endpoint — no authentication required.
   * Stricter rate-limit: 10 submissions per minute per IP to prevent abuse.
   */
  @Post('submit')
  // Login opcional: sem token segue anônimo; com token, um formulário de identificação
  // obrigatória usa o nome/e-mail do usuário quando o envio não traz (app mobile).
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Submeter resposta a um formulário (público)' })
  submit(
    @Body() payload: SubmitResponseDto,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ): Promise<SubmissionEntity> {
    const rawAgent = req.headers['user-agent'];
    const userAgent = typeof rawAgent === 'string' ? rawAgent.substring(0, 255) : null;
    const idempotentPayload =
      !payload.idempotencyKey && idempotencyHeader
        ? { ...payload, idempotencyKey: idempotencyHeader }
        : payload;
    const user = (req.user as JwtPayload | null | undefined) ?? null;
    return this.responsesService.submit(
      idempotentPayload,
      ip ?? null,
      userAgent,
      user ? { email: user.email, fullName: user.fullName } : null,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // Sem permissão na rota: abre quem vê as respostas do processo, o card que nasceu delas ou foi
  // chamado a aprovar algo nele (ProcessAccessService.assertSubmissionReadable).
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obter detalhe de uma resposta' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SubmissionEntity> {
    return this.responsesService.findOne(
      id,
      currentUser.sub,
      currentUser.role,
      currentUser.areaId ?? null,
    );
  }
}
