import type {
  KanbanPhaseApprovalApproved,
  KanbanPhaseApprovalRejected,
  KanbanPhaseApprovalRequest,
} from '../types';

export type PhaseApprovalAutomationDraft = {
  approvalRequest: KanbanPhaseApprovalRequest;
  approvalOnApproved: KanbanPhaseApprovalApproved;
  approvalOnRejected: KanbanPhaseApprovalRejected;
};

const labelCls = 'text-[11px] font-bold uppercase tracking-wide text-tx-secondary';
const selectCls =
  'h-9 w-full rounded-[8px] border border-border-default bg-bg-s2 px-2.5 text-sm text-tx-primary outline-none focus:border-primary';

/**
 * O que a fase faz sozinha com a aprovação, sem fluxo: quando pede e o que acontece com o card
 * depois da decisão. Na 1ª fase o "formulário" é o de abertura (completo quando os anexos chegam);
 * sem fase seguinte/anterior, a opção que dependeria dela fica desligada.
 */
export function PhaseApprovalAutomationEditor({
  value,
  isFirst,
  hasNext,
  onChange,
}: {
  value: PhaseApprovalAutomationDraft;
  isFirst: boolean;
  hasNext: boolean;
  onChange: (next: PhaseApprovalAutomationDraft) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className={labelCls}>Pedir a aprovação</span>
        <select
          aria-label="Quando pedir a aprovação"
          value={value.approvalRequest}
          onChange={(e) => onChange({ ...value, approvalRequest: e.target.value as KanbanPhaseApprovalRequest })}
          className={selectCls}
        >
          <option value="manual">Pelo botão no card</option>
          <option value="on_enter">Assim que o card chegar na fase</option>
          <option value="on_complete">
            {isFirst ? 'Quando o formulário chegar completo (com os anexos)' : 'Quando salvarem o formulário da fase'}
          </option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className={labelCls}>Se aprovarem</span>
        <select
          aria-label="Se aprovarem"
          value={value.approvalOnApproved}
          onChange={(e) => onChange({ ...value, approvalOnApproved: e.target.value as KanbanPhaseApprovalApproved })}
          className={selectCls}
        >
          <option value="stay">O card espera alguém mover</option>
          <option value="next" disabled={!hasNext}>
            Vai sozinho para a próxima fase
          </option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className={labelCls}>Se reprovarem</span>
        <select
          aria-label="Se reprovarem"
          value={value.approvalOnRejected}
          onChange={(e) => onChange({ ...value, approvalOnRejected: e.target.value as KanbanPhaseApprovalRejected })}
          className={selectCls}
        >
          <option value="stay">O card fica na fase (só pode voltar)</option>
          <option value="previous" disabled={isFirst}>
            Volta sozinho para a fase anterior
          </option>
          <option value="close">Encerra a solicitação como reprovada</option>
        </select>
      </label>
    </div>
  );
}
