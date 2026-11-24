import type { AppConfig } from '../config/app-config';
import type { MysqlService } from '../db/mysql.service';
import type { Fonte } from './fonte.types';
import { PedidosFonte } from './pedidos.fonte';
import { ViewFonte } from './view.fonte';

/**
 * Listas servidas pela API. Cada lista nova entra aqui só depois de definida com o dono do
 * projeto: tabela, código, texto exibido, colunas pesquisáveis, filtros e ordem
 * (ver "Como definir uma lista" em Docs/campo_lista_erp_plano.md).
 */
export function criarFontes(db: MysqlService, config: AppConfig): Fonte[] {
  const fontes: Fonte[] = [new PedidosFonte(db, config.queryTimeoutMs)];

  if (config.fonteExemploHabilitada) {
    // Só desenvolvimento: lê a view criada por dev/seed.sql, que não existe no ERP real.
    fontes.push(
      new ViewFonte(
        db,
        { id: 'exemplo', label: 'Exemplo (desenvolvimento)', modo: 'pesquisa', view: 'vw_exemplo' },
        config.queryTimeoutMs,
      ),
    );
  }

  return fontes;
}
