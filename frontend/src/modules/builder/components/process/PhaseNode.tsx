import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clock, FileText, Flag, Maximize2, Play, Plus, Settings, ShieldCheck, Trash2, Users, Zap } from 'lucide-react';
import { phaseColorHex } from '../../../kanban-phases/types';

export type PhaseNodeData = {
  index: number;
  label: string;
  color: string;
  description: string;
  isFirst: boolean;
  isTerminal: boolean;
  actorsLabel: string;
  approvalLabel: string | null;
  slaLabel: string | null;
  /** Resumo do formulário da fase (na 1ª fase, o de abertura). */
  formLabel: string;
  formSubLabel: string | null;
  hasForm: boolean;
  /** Fase ainda não pode ser configurada (processo sem salvar). */
  locked: boolean;
  selected: boolean;
  onConfigure: () => void;
  onExpandForm: () => void;
  onRemove?: () => void;
  /** Fluxos do processo que tocam esta fase (0 = não mostra o chip). */
  automationCount?: number;
  onOpenAutomations?: () => void;
  /** Um nó de fluxo está sendo arrastado sobre esta fase. */
  dropTarget?: boolean;
};

// Handles na linha do título, como no mapa de seções.
const handleClassName = '!h-2.5 !w-2.5 !border-2 !border-[#94a3b8] !bg-bg-surface';
const handleStyle = { top: 42 };

export const PHASE_NODE_WIDTH = 280;

export function PhaseNode({ data }: NodeProps) {
  const d = data as PhaseNodeData;
  const color = phaseColorHex(d.color);

  return (
    <div
      className={[
        'relative cursor-pointer overflow-visible rounded-[12px] border-[1.5px] bg-bg-surface',
        d.dropTarget
          ? 'border-[#3B82F6] shadow-[0_0_0_5px_rgba(59,130,246,.3)]'
          : d.selected
            ? 'border-primary shadow-[0_0_0_4px_rgba(26,60,143,.18),0_20px_40px_rgba(13,29,41,.06)]'
            : 'border-border-strong shadow-soft',
      ].join(' ')}
      style={{ width: PHASE_NODE_WIDTH }}
    >
      {d.dropTarget ? (
        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#3B82F6] px-3 py-1 text-xs font-bold text-white shadow">
          Soltar para ligar a esta fase
        </div>
      ) : null}
      <div className="h-1 rounded-t-[10px]" style={{ background: color }} />
      <Handle type="target" position={Position.Left} className={handleClassName} style={handleStyle} />

      <div className="flex items-center gap-2.5 px-4 pb-1.5 pt-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
          style={{ background: color }}
        >
          {d.index + 1}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-bold text-tx-primary">
          {d.label || 'Fase sem nome'}
        </h3>
        {/* `nodrag`: os botões não arrastam o nó; o clique para aqui. */}
        <div className="nodrag flex shrink-0 items-center" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={d.onConfigure}
            disabled={d.locked}
            aria-label={`Configurar fase ${d.label || 'sem nome'}`}
            title={d.locked ? 'Salve o processo para configurar as fases' : 'Configurar fase'}
            className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-muted hover:bg-bg-hover hover:text-tx-primary disabled:opacity-40"
          >
            <Settings className="h-4 w-4" />
          </button>
          {d.onRemove ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Remover a fase "${d.label || 'sem nome'}"?`)) d.onRemove?.();
              }}
              aria-label={`Remover fase ${d.label || 'sem nome'}`}
              className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-muted hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {d.isFirst ? (
          <Chip tone="ok">
            <Play className="h-3 w-3" /> Início
          </Chip>
        ) : null}
        {d.isTerminal ? (
          <Chip tone="ok">
            <Flag className="h-3 w-3" /> Fase final
          </Chip>
        ) : null}
        <Chip>
          <Users className="h-3 w-3" /> {d.actorsLabel}
        </Chip>
        {d.approvalLabel ? (
          <Chip tone="warn">
            <ShieldCheck className="h-3 w-3" /> {d.approvalLabel}
          </Chip>
        ) : null}
        {d.slaLabel ? (
          <Chip>
            <Clock className="h-3 w-3" /> {d.slaLabel}
          </Chip>
        ) : null}
        {d.automationCount ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              d.onOpenAutomations?.();
            }}
            title="Ver as automações desta fase"
            className="nodrag inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/20 dark:text-blue-300"
          >
            <Zap className="h-3 w-3" />
            {d.automationCount} {d.automationCount === 1 ? 'automação' : 'automações'}
          </button>
        ) : null}
      </div>

      <div className="nodrag rounded-b-[12px] border-t border-border-subtle bg-bg-s2 px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-tx-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-tx-primary">{d.formLabel}</p>
            {d.formSubLabel ? <p className="truncate text-xs text-tx-secondary">{d.formSubLabel}</p> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={d.onExpandForm}
          disabled={d.locked && !d.isFirst}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-border-strong bg-bg-surface text-xs font-bold text-primary hover:bg-bg-hover disabled:opacity-50 dark:text-blue-300"
        >
          {d.hasForm ? <Maximize2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {d.hasForm ? 'Expandir formulário' : 'Criar formulário'}
        </button>
      </div>

      <Handle type="source" position={Position.Right} className={handleClassName} style={handleStyle} />
      {/* Ligações com as automações do mapa, por baixo da fase, na ordem de leitura: chega à
          esquerda, sai à direita (as linhas não se cruzam). */}
      <Handle
        id="auto-in"
        type="target"
        position={Position.Bottom}
        title='Chegada: "Mover para fase" traz o pedido; "Webhook recebido" ou "Agendado" cria um pedido novo aqui'
        className="!h-3.5 !w-3.5 !border-2 !border-[#3B82F6] !bg-bg-surface"
        style={{ left: '35%' }}
      />
      <Handle
        id="auto-out"
        type="source"
        position={Position.Bottom}
        title="Puxe até um nó: a automação passa a valer para esta fase"
        className="!h-3.5 !w-3.5 !border-2 !border-white !bg-[#3B82F6]"
        style={{ left: '65%' }}
      />
    </div>
  );
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'ok' }) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'neutral' ? 'bg-bg-s2 text-tx-secondary' : '',
        tone === 'warn' ? 'bg-amber-100 text-amber-800' : '',
        tone === 'ok' ? 'bg-green-100 text-green-700' : '',
      ].join(' ')}
    >
      {children}
    </span>
  );
}
