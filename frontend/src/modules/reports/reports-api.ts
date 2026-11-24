import { api } from '../../services/api';
import type { SolicitationStatus } from '../solicitations/types';

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  areaId?: string;
  status?: SolicitationStatus;
  formId?: string;
};

export async function downloadExecutiveReport(filters: ReportFilters): Promise<Blob> {
  const { data } = await api.get<Blob>('/reports/solicitations/executive', {
    params: filters,
    responseType: 'blob',
    timeout: 30000,
  });
  return data;
}
