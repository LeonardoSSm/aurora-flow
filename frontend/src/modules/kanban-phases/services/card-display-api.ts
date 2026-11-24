import { api } from '../../../services/api';
import type { CardDisplay, PhaseCardDisplayView } from '../lib/card-display';

const base = (formId: string, phaseId: string) => `/forms/${formId}/kanban-phases/${phaseId}/card-display`;

export async function fetchPhaseCardDisplay(formId: string, phaseId: string): Promise<PhaseCardDisplayView> {
  const { data } = await api.get<PhaseCardDisplayView>(base(formId, phaseId));
  return data;
}

/** `null` apaga o ajuste (a pessoa volta ao padrão da fase). */
export async function savePersonalCardDisplay(
  formId: string,
  phaseId: string,
  display: CardDisplay | null,
): Promise<PhaseCardDisplayView> {
  const { data } = display
    ? await api.put<PhaseCardDisplayView>(`${base(formId, phaseId)}/me`, display)
    : await api.delete<PhaseCardDisplayView>(`${base(formId, phaseId)}/me`);
  return data;
}

/** `null` volta a fase ao card padrão do sistema. */
export async function savePhaseCardDisplay(
  formId: string,
  phaseId: string,
  display: CardDisplay | null,
): Promise<PhaseCardDisplayView> {
  const { data } = display
    ? await api.put<PhaseCardDisplayView>(base(formId, phaseId), display)
    : await api.delete<PhaseCardDisplayView>(base(formId, phaseId));
  return data;
}
