import { Controller, Get, UseGuards } from '@nestjs/common';
import { TokenGuard } from './auth/token.guard';
import { MysqlService } from './db/mysql.service';

@Controller()
export class HealthController {
  constructor(private readonly db: MysqlService) {}

  /**
   * O "Testar conexão" do conector de ERP no Tijuca faz GET na raiz da URL mandando o token.
   * Exigir o token aqui faz o teste acusar credencial errada (401), não só "chegou no host".
   */
  @Get()
  @UseGuards(TokenGuard)
  raiz(): { status: 'ok'; servico: string } {
    return { status: 'ok', servico: 'erp-lookup' };
  }

  /**
   * Sempre 200 enquanto o processo está de pé (é o healthcheck do Docker); o estado do MySQL
   * vai em `db` para quem estiver conferindo o deploy.
   */
  @Get('health')
  async health(): Promise<{ status: 'ok'; db: 'ok' | 'down' | 'nao_configurado' }> {
    return { status: 'ok', db: await this.db.ping() };
  }
}
