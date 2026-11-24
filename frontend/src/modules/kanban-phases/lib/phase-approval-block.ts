import axios from 'axios';

/**
 * Recusa da trava de aprovação da fase ao mover o card (backend: SolicitationsService.movePhase).
 * Quem aprova a fase não chega aqui: mover o card já aprova. Os demais recebem quem aprova e se
 * podem pedir a aprovação ali mesmo — é o que o pop-up mostra.
 */
export type PhaseApprovalBlock = {
  code: 'phase_approval_required' | 'phase_approval_pending' | 'phase_approval_rejected';
  message: string;
  phaseId: string;
  phaseLabel: string;
  approvers: string[];
  canRequest: boolean;
};

const CODES: readonly PhaseApprovalBlock['code'][] = [
  'phase_approval_required',
  'phase_approval_pending',
  'phase_approval_rejected',
];

/** A trava de aprovação dentro do erro da API, ou null quando o erro é outro (servidor antigo também). */
export function phaseApprovalBlockOf(error: unknown): PhaseApprovalBlock | null {
  if (!axios.isAxiosError(error)) return null;
  const data: unknown = error.response?.data;
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (!CODES.includes(body.code as PhaseApprovalBlock['code']) || typeof body.message !== 'string') return null;
  return {
    code: body.code as PhaseApprovalBlock['code'],
    message: body.message,
    phaseId: typeof body.phaseId === 'string' ? body.phaseId : '',
    phaseLabel: typeof body.phaseLabel === 'string' ? body.phaseLabel : '',
    approvers: Array.isArray(body.approvers)
      ? body.approvers.filter((name): name is string => typeof name === 'string')
      : [],
    canRequest: body.canRequest === true,
  };
}

/** "Ana", "Ana ou perfil Financeiro", "Ana, Bruno ou perfil Financeiro". */
export function describeApprovers(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'quem aprova a fase';
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}
