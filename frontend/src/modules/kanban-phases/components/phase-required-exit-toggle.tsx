/**
 * "Só avança com os obrigatórios preenchidos" (`requireFieldsToExit`): o card não vai para uma fase
 * seguinte enquanto houver campo obrigatório desta fase em branco. Vale para pessoas, fluxos e
 * aprovação que avança sozinha; voltar para uma fase anterior é livre. Quem garante é o backend.
 */
export function PhaseRequiredExitToggle({
  checked,
  requiredCount,
  onChange,
}: {
  checked: boolean;
  /** Campos com resposta marcados como obrigatórios (sem título/descrição/divisor). */
  requiredCount: number;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-[10px] border border-border-default p-3">
      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border-default"
        />
        <span>
          <span className="font-semibold">Só avançar com os obrigatórios preenchidos</span>
          <span className="block text-xs text-tx-secondary">
            O card não vai para a próxima fase enquanto algum campo obrigatório desta fase estiver em
            branco, nem por fluxo ou aprovação automática. Esta trava não impede voltar para uma fase
            anterior.
          </span>
        </span>
      </label>
      {checked && requiredCount === 0 ? (
        <p role="status" className="pl-6 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Nenhum campo está marcado como obrigatório: marque “Obrigatório” nos campos que precisam
          estar preenchidos.
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Só avançar com responsável" (`requireAssigneeToExit`): o card não vai para uma fase seguinte
 * enquanto ninguém estiver atribuído a ele. Mesmas regras da trava de campos obrigatórios.
 */
export function PhaseAssigneeExitToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-[10px] border border-border-default p-3">
      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border-default"
        />
        <span>
          <span className="font-semibold">Só avançar com responsável</span>
          <span className="block text-xs text-tx-secondary">
            O card não vai para a próxima fase enquanto ninguém estiver atribuído a ele, nem por fluxo
            ou aprovação automática. Esta trava não impede voltar para uma fase anterior.
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * "Ponto sem volta" (`blockMoveBack`): depois que o card chega a esta fase, as pessoas não o
 * devolvem para uma fase anterior a ela. Quem configura as fases ainda devolve (avanço por engano)
 * e o processo também (fluxo "Mover para fase", reprovação que devolve sozinha). Quem garante é o
 * backend.
 */
export function PhaseNoReturnToggle({
  checked,
  rejectedStays,
  onChange,
}: {
  checked: boolean;
  /** A fase pede aprovação e, reprovada, o card fica: com a trava, só quem configura devolve. */
  rejectedStays: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-[10px] border border-border-default p-3">
      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border-default"
        />
        <span>
          <span className="font-semibold">Ponto sem volta</span>
          <span className="block text-xs text-tx-secondary">
            Depois que o card chega a esta fase, ninguém o devolve para uma fase anterior a ela. Só quem
            configura as fases do processo pode voltar (para corrigir um avanço por engano), além das
            automações do processo.
          </span>
        </span>
      </label>
      {checked && rejectedStays ? (
        <p role="status" className="pl-6 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Reprovada, a aprovação desta fase segura o card aqui: só quem configura as fases poderá
          devolvê-lo. Para ele voltar sozinho, escolha “Volta sozinho para a fase anterior” em “Se
          reprovarem”.
        </p>
      ) : null}
    </div>
  );
}
