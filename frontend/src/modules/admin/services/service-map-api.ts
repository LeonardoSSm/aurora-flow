import { api } from '../../../services/api';
import type { ServiceState } from '../service-map/topology';

export type ServiceStatusDto = {
  /** Id da topologia (`service-map/topology.ts`). */
  id: string;
  status: ServiceState;
  latencyMs?: number;
  /** Explicação de falha ou degradação, ex.: "Fila notificacoes.whatsapp com 1.240 mensagens acumuladas." */
  message?: string;
  checkedAt: string;
};

export type ServiceMapStatusDto = {
  services: ServiceStatusDto[];
  checkedAt: string;
};

/** Estado dos containers do docker-compose (o backend guarda o resultado por 10 s). */
export async function fetchServiceMapStatus(): Promise<ServiceMapStatusDto> {
  const { data } = await api.get<ServiceMapStatusDto>('/admin/service-map/status');
  return data;
}
