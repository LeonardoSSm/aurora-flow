import { apiBaseUrl } from '../../../services/api';

/**
 * URL entregue ao sistema externo. `list`: a rota que recebe só uma lista (arquivo .txt/.csv, texto
 * ou JSON) e entrega aos fluxos { itens: [...] } — o Lote do gatilho de webhook usa `itens`.
 */
export function buildInboundUrl(token: string, kind: 'event' | 'list' = 'event'): string {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/webhooks/in/${token}`;
  return kind === 'list' ? `${url}/list` : url;
}
