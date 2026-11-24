import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, FileText, Filter, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SectionFlowNodeData } from '../../lib/section-flow-layout';
import { fieldTypeIcon } from '../../types';
import { useSectionFlowActions } from './section-flow-actions';

// Handles na linha do título (centro a 38px do topo do nó).
const handleClassName = '!h-2.5 !w-2.5 !border-2 !border-[#94a3b8] !bg-bg-surface';
const handleStyle = { top: 38 };

function SectionNodeMenu({ sectionId, title }: { sectionId: string; title: string }) {
  const actions = useSectionFlowActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!actions) return null;

  return (
    // `nodrag`: o menu não arrasta o nó; o clique para aqui e não abre o modal.
    <div ref={rootRef} className="nodrag relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Ações da seção ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-ph hover:bg-bg-hover hover:text-tx-secondary"
      >
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 grid w-40 rounded-[10px] border border-border-strong bg-bg-surface py-1 shadow-[0_8px_24px_rgba(13,29,41,.08)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              actions.onEditSection(sectionId);
            }}
            className="flex items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-tx-primary hover:bg-bg-hover"
          >
            <Pencil className="h-3.5 w-3.5 text-tx-secondary" />
            Editar
          </button>
          {actions.onRemoveSection ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (window.confirm(`Remover a seção "${title}" e todos os campos dela?`)) {
                  actions.onRemoveSection?.(sectionId);
                }
              }}
              className="flex items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-error hover:bg-[#fff1f1]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SectionNode({ id, data }: NodeProps) {
  const d = data as SectionFlowNodeData;

  return (
    <div
      className={[
        'relative w-[260px] cursor-pointer rounded-[12px] border-[1.5px] bg-bg-surface',
        d.selected
          ? 'shadow-[0_0_0_4px_rgba(26,60,143,.18),0_20px_40px_rgba(13,29,41,.06)]'
          : 'shadow-soft',
        d.orphaned ? 'border-error' : d.selected ? 'border-primary' : 'border-border-strong',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={handleClassName}
        style={handleStyle}
      />

      <div className="flex items-center gap-2.5 px-4 pb-1.5 pt-3.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
          {d.index + 1}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold text-tx-primary">{d.title}</h3>
        {d.orphaned ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-error" aria-label="Regra órfã" />
        ) : null}
        <SectionNodeMenu sectionId={id} title={d.title} />
      </div>

      {d.description ? (
        <p className="pb-3 pl-[54px] pr-4 text-sm leading-[1.35] text-tx-secondary">
          {d.description}
        </p>
      ) : null}

      {d.previewFields.length > 0 ? (
        <div className="grid gap-[7px] border-t border-border-subtle px-4 py-2.5">
          {d.previewFields.map((field, fieldIndex) => {
            const Icon = fieldTypeIcon[field.fieldType];
            return (
              <div key={fieldIndex} className="flex min-w-0 items-center gap-[9px] text-sm">
                <Icon className="h-[15px] w-4 shrink-0 text-tx-muted" />
                <span className="min-w-0 flex-1 truncate text-tx-primary">{field.label}</span>
                {field.required ? (
                  <span className="font-bold text-error" aria-label="Obrigatório">
                    *
                  </span>
                ) : null}
              </div>
            );
          })}
          {d.remainingFieldCount > 0 ? (
            <span className="text-sm font-semibold text-primary dark:text-blue-300">
              +{d.remainingFieldCount} campo{d.remainingFieldCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 rounded-b-[12px] border-t border-border-subtle bg-bg-s2 px-4 py-2.5">
        <span className="inline-flex items-center gap-[5px] rounded-full border border-border-default bg-bg-surface px-[9px] py-0.5 text-[13px] font-semibold text-tx-secondary">
          <FileText className="h-[13px] w-[13px]" />
          {d.fieldCount} campo{d.fieldCount === 1 ? '' : 's'}
        </span>
        {d.ruleCount > 0 ? (
          <span className="inline-flex items-center gap-[5px] rounded-full bg-amber-100 px-[9px] py-0.5 text-[13px] font-semibold text-amber-700">
            <Filter className="h-[13px] w-[13px]" />
            {d.ruleCount} regra{d.ruleCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {d.automationCount > 0 ? (
          <span className="inline-flex items-center gap-[5px] rounded-full bg-violet-100 px-[9px] py-0.5 text-[13px] font-semibold text-violet-700">
            <Zap className="h-[13px] w-[13px]" />
            {d.automationCount}
          </span>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={handleClassName}
        style={handleStyle}
      />
    </div>
  );
}
