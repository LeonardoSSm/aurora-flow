import { Braces, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFlowFormFields } from '../../hooks/use-flow-form-fields';
import { fieldVariables } from '../../lib/field-variables';
import type { NodeOutputVariable, NodeVariableGroups, VariableGroup } from '../../lib/node-outputs';

/** Copia um token e lembra qual foi por 1,2s (o "Copiado" do botão). */
export function useCopyToken() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  function copy(token: string) {
    navigator.clipboard?.writeText(token).catch(() => {});
    setCopied(token);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1200);
  }
  return { copied, copy };
}

const tokenOf = (item: NodeOutputVariable, paths?: boolean) =>
  paths ? item.name : `{{${item.name}}}`;

function GroupList({
  group,
  field = false,
  copied,
  onCopy,
}: {
  group: VariableGroup;
  field?: boolean;
  copied: string | null;
  onCopy: (token: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-tx-secondary">{group.title}</p>
      {group.items.map((item) => {
        const token = tokenOf(item, group.paths);
        const isCopied = copied === token;
        return (
          <button
            key={token}
            type="button"
            onClick={() => onCopy(token)}
            title="Clique para copiar"
            className="flex w-full items-start justify-between gap-2 rounded-lg border border-border-default bg-bg-surface px-2.5 py-2 text-left transition-colors hover:border-nc-accent"
          >
            <span className="grid min-w-0 gap-0.5">
              <span
                className={[
                  'break-all font-mono text-xs',
                  field ? 'text-nc-field-var' : 'text-nc-accent',
                ].join(' ')}
              >
                {token}
              </span>
              <span className="text-xs text-tx-muted">{item.label}</span>
            </span>
            <span
              className={[
                'shrink-0 text-[11px] font-semibold',
                isCopied ? 'text-nc-ok' : 'text-tx-ph',
              ].join(' ')}
            >
              {isCopied ? 'Copiado' : 'Copiar'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Coluna direita do modal: a prévia (nós que enviam texto) e as variáveis que este nó e os nós
 * anteriores deixam para os próximos — clique para copiar.
 */
export function NodeAside({
  groups,
  formId,
  preview,
}: {
  groups: NodeVariableGroups;
  formId: string | null;
  preview?: ReactNode;
}) {
  const { copied, copy } = useCopyToken();
  const { data: fields = [] } = useFlowFormFields(groups.formFields ? formId : null);
  const formGroup: VariableGroup | null =
    groups.formFields && fields.length > 0
      ? { title: 'Campos do formulário', items: fieldVariables(fields) }
      : null;
  const empty = !groups.own && !groups.note && groups.upstream.length === 0 && !formGroup;

  return (
    <div className="grid content-start gap-[18px]">
      {preview}

      <div className="grid gap-0.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-tx-muted">
          <Braces className="h-[13px] w-[13px]" />
          Variáveis para os próximos nós
        </p>
        <p className="text-xs text-tx-muted">Clique para copiar.</p>
      </div>

      {groups.note && (
        <p className="rounded-[10px] border border-dashed border-border-strong px-3.5 py-3.5 text-[13px] leading-[1.5] text-tx-secondary">
          {groups.note}
        </p>
      )}
      {groups.own && <GroupList group={groups.own} copied={copied} onCopy={copy} />}
      {groups.upstream.map((group) => (
        <GroupList key={group.title} group={group} copied={copied} onCopy={copy} />
      ))}
      {formGroup && <GroupList group={formGroup} field copied={copied} onCopy={copy} />}
      {empty && (
        <p className="text-[13px] leading-[1.5] text-tx-muted">
          Ligue este nó a um gatilho para ver as variáveis que chegam até ele.
        </p>
      )}
    </div>
  );
}

/** Bloco recolhível do painel compacto: só o que o próprio nó produz, em chips. */
export function CompactVariables({ items }: { items: readonly NodeOutputVariable[] }) {
  const [open, setOpen] = useState(true);
  const { copied, copy } = useCopyToken();
  if (items.length === 0) return null;

  return (
    <div className="rounded-[10px] bg-bg-s2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-[11px] text-left text-[13px] font-semibold text-tx-primary"
      >
        Variáveis para os próximos nós
        <span className="font-medium text-tx-muted">{items.length}</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-tx-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
          {items.map((item) => {
            const token = tokenOf(item);
            return (
              <button
                key={token}
                type="button"
                title={`${item.label} — clique para copiar`}
                onClick={() => copy(token)}
                className="h-[26px] rounded-md bg-nc-accent-soft px-[9px] font-mono text-xs text-nc-accent"
              >
                {copied === token ? 'Copiado' : token}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
