import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FormsService } from './forms.service';

type PublicFormResponse = Awaited<ReturnType<FormsService['findPublicOne']>>;

/**
 * Public endpoints - no authentication required.
 * Rate-limited more strictly (30 req/min) to protect against scraping.
 */
@ApiTags('public')
@Controller('public/forms')
@Throttle({ default: { ttl: 60000, limit: 30 } })
export class PublicFormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Obter formulario publicado por ID (publico)' })
  findPublicOne(@Param('id') id: string): Promise<PublicFormResponse> {
    return this.formsService.findPublicOne(id);
  }
}
