import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Asterisk,
  ChevronDown,
  ChevronUp,
  Copy,
  Filter,
  GripVertical,
  Lock,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../../hooks/use-reduced-motion';
import {
  FormulaEditor,
  NumberSettingInput,
  type FormulaAvailableField,
  type FormulaPhaseOption,
} from './formula-editor';
import { ScoreResultEditor, SectionScoreEditor } from './score-field-editors';
import { scoreModeOf, type ScoredChoiceField } from '../lib/score-fields';
import type {
  FieldConditionOperator,
  FieldConditions,
  FieldSettings,
  FormFieldType,
  VisibilityCondition,
  VisibilityConditionOperator,
  VisibilityRule,
} from '../../forms/types';
import { createDraftFieldOption, createLocalId } from '../state/draft.helpers';
import { ErpLookupSettingsEditor } from './erp-lookup-settings-editor';
import { PasteOptions } from './paste-options';
import { ItemListSource } from '../../item-lists/item-list-source';
import { ItemOrderSettingsEditor } from './item-order-settings-editor';
import type { ItemListDetail } from '../../item-lists/item-lists-api';
import {
  LIST_FIELD_TYPES,
  linkOptions,
  linkSettings,
  readHiddenOptionValues,
  readItemListId,
  visibleOptions,
} from '../../item-lists/linked-options';

/** Opção que já veio do servidor (id uuid) — opção criada agora tem id local. */
const SAVED_OPTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import {
  type ErpTableDependencyField,
  type ErpTableParameter,
  ErpTableSettingsEditor,
} from './erp-table-settings-editor';
import {
  DEFAULT_PRODUCT_TABLE_COLUMNS,
  fieldTypeChoiceLabel,
  fieldTypeIconOf,
  isDecorativeFieldType,
  supportsAdvancedSettings,
  supportsOptions,
  type DraftField,
  type DraftFieldOption,
} from '../types';
import type { ProductTableColumn } from '../../forms/types';
import { DownloadFileEditor } from './download-file-editor';
import { UserEmailSettingsEditor } from './user-email-settings-editor';

type AvailableField = FormulaAvailableField;

type FieldUpdateValue =
  | string
  | boolean
  | FormFieldType
  | FieldSettings
  | FieldConditions
  | VisibilityRule[]
  | DraftFieldOption[]
  | null;

type BuilderWizardFieldRowProps = {
  field: DraftField;
  /** Processo já salvo (envio do "Arquivo para baixar"); null = ainda não salvo. */
  formId?: string | null;
  /** Posição na seção, a partir de 1 ("01", "02"…). Não muda com a busca ativa. */
  position: number;
  availableFields: AvailableField[];
  /** Fases salvas do processo (faixas do campo calculado); null = processo ainda não salvo. */
  phaseOptions?: FormulaPhaseOption[] | null;
  /** Códigos dos campos da mesma seção (atalho de pontuação do campo calculado). */
  sectionFieldCodes?: string[];
  /** Perguntas de escolha da mesma seção ("Pontuação da seção"). */
  sectionQuestions?: ScoredChoiceField[];
  /** "Pontuação da seção" do formulário inteiro ("Resultado da pontuação"). */
  sectionScoreFields?: Array<{ code: string; label: string; sectionTitle?: string }>;
  /** Tabela dinâmica do ERP: campos antes deste que podem ser parâmetro da consulta. */
  erpTableDependencyFields?: ErpTableDependencyField[];
  /** Tabela dinâmica do ERP: cria antes deste campo um campo para o parâmetro e o associa. */
  onCreateErpTableParameterField?: (parameter: ErpTableParameter) => void;
  /** Linha aberta no accordion (só uma por vez, controlada pela lista). */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Abre o seletor de tipos no modo "trocar tipo" para este campo. */
  onOpenTypePicker: () => void;
  onDuplicate?: () => void;
  onChange: (key: keyof DraftField, value: FieldUpdateValue) => void;
  onRemove: () => void;
  canRemove: boolean;
};

/** Editor aberto abaixo das duas colunas do painel — um de cada vez. */
type FieldEditor = 'visibility' | 'conditions' | 'settings';

/** Tipos em que a configuração é parte do campo (sem ela ele não funciona): o painel já abre nela. */
const SETTINGS_FIRST_TYPES: ReadonlySet<FormFieldType> = new Set([
  'calculated',
  'erp_lookup',
  'erp_table',
  'item_order',
  'product_table',
]);

const primarySoftChip = 'bg-brand-primary-light text-primary dark:bg-primary/30 dark:text-tx-primary';
const amberChip = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';


const conditionOperators: Array<{ value: FieldConditionOperator; label: string }> = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'is_empty', label: 'Está vazio' },
  { value: 'is_not_empty', label: 'Não está vazio' },
  { value: 'contains', label: 'Contém' },
];

/**
 * Rótulo do campo costuma ser uma pergunta inteira, não uma palavra — um `<input>` de
 * uma linha só deixa a maior parte do texto escondida atrás de rolagem horizontal.
 * Este textarea de uma "linha" cresce em altura conforme o texto quebra, mas continua
 * gravando uma string simples: Enter é bloqueado pra não entrar quebra de linha manual
 * no rótulo (ele é usado como cabeçalho de exportação e no formulário público, onde
 * uma quebra de linha embutida quebraria o layout).
 */
function AutoGrowLabelInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault();
      }}
      placeholder={placeholder}
      className={['block resize-none overflow-hidden', className].filter(Boolean).join(' ')}
    />
  );
}

function SwitchControl({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
        checked ? 'bg-primary' : 'bg-bg-hover',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}


/** Editor da lista de colunas extras da tabela de produtos (além do nome, fixo). */
function ProductTableColumnsEditor({
  columns,
  onChange,
}: {
  columns: ProductTableColumn[];
  onChange: (columns: ProductTableColumn[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold text-tx-secondary">
        Colunas (além do nome do produto)
      </p>
      <div className="grid gap-2">
        {columns.map((column, index) => (
          <div key={column.id} className="flex items-center gap-2">
            <input
              value={column.label}
              onChange={(event) => {
                const next = columns.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label: event.target.value } : item,
                );
                onChange(next);
              }}
              placeholder="Nome da coluna"
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
            />
            <select
              value={column.type}
              onChange={(event) => {
                const next = columns.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, type: event.target.value as ProductTableColumn['type'] }
                    : item,
                );
                onChange(next);
              }}
              className="h-9 shrink-0 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
            >
              <option value="number">Número</option>
              <option value="text">Texto</option>
            </select>
            <select
              value={column.filledBy}
              onChange={(event) => {
                const next = columns.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, filledBy: event.target.value as ProductTableColumn['filledBy'] }
                    : item,
                );
                onChange(next);
              }}
              title="Quem preenche o valor desta coluna"
              className="h-9 shrink-0 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
            >
              <option value="respondent">Quem responde</option>
              <option value="creator">Você (fixo por produto)</option>
            </select>
            <button
              type="button"
              aria-label="Remover coluna"
              disabled={columns.length <= 1}
              onClick={() => onChange(columns.filter((_, itemIndex) => itemIndex !== index))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-[#fff1f1] hover:text-error disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-tx-ph">
        &quot;Quem responde&quot; fica editável na hora de responder. &quot;Você (fixo por
        produto)&quot; some da tela de resposta — o valor é definido por produto logo abaixo, em
        Produtos.
      </p>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...columns,
            {
              id: createLocalId('col'),
              label: `Coluna ${columns.length + 1}`,
              type: 'number',
              filledBy: 'respondent',
            },
          ])
        }
        className="mt-1 w-fit text-xs font-bold text-primary"
      >
        + Adicionar coluna
      </button>
    </div>
  );
}

function updateConditionValue(
  current: FieldConditions,
  updater: (
    rules: NonNullable<FieldConditions['show_if']>,
  ) => NonNullable<FieldConditions['show_if']>,
) {
  const rules = Array.isArray(current.show_if) ? current.show_if : [];
  return {
    ...current,
    show_if: updater(rules),
  };
}

const allVisibilityOperators: Array<{ value: VisibilityConditionOperator; label: string }> = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'contains', label: 'Contém' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'is_empty', label: 'Está vazio' },
  { value: 'is_not_empty', label: 'Não está vazio' },
];

function getVisibilityOperators(fieldType: FormFieldType) {
  if (['number', 'scale', 'rating', 'date', 'datetime', 'time'].includes(fieldType)) {
    return allVisibilityOperators;
  }
  if (['checkbox'].includes(fieldType)) {
    return allVisibilityOperators.filter((op) =>
      ['equals', 'not_equals', 'is_empty', 'is_not_empty'].includes(op.value),
    );
  }
  return allVisibilityOperators.filter(
    (op) => op.value !== 'greater_than' && op.value !== 'less_than',
  );
}

function getOrCreateRule(rules: VisibilityRule[] | null): VisibilityRule {
  return rules?.[0] ?? { operator: 'and', conditions: [], action: 'show' };
}

function setRule(
  rules: VisibilityRule[] | null,
  updater: (rule: VisibilityRule) => VisibilityRule,
): VisibilityRule[] | null {
  const rule = updater(getOrCreateRule(rules));
  return rule.conditions.length === 0 ? null : [rule];
}

function hasVisibilityConditions(field: DraftField): boolean {
  return (
    Array.isArray(field.visibilityRules) &&
    field.visibilityRules.length > 0 &&
    field.visibilityRules[0].conditions.length > 0
  );
}

/** Editor que o painel abre de início: só a configuração dos tipos que dependem dela. */
function initialEditor(field: DraftField): FieldEditor | null {
  return SETTINGS_FIRST_TYPES.has(field.fieldType) ? 'settings' : null;
}

function Badge({ className, icon, children }: { className: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-bold ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Abre com a altura animada (150–200ms); sem animação com movimento reduzido. */
function AccordionPanel({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(reducedMotion);
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return (
    <div
      onTransitionEnd={() => setSettled(true)}
      className={[
        'grid',
        reducedMotion ? '' : 'transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      ].join(' ')}
    >
      <div className={['min-h-0', settled ? '' : 'overflow-hidden'].join(' ')}>{children}</div>
    </div>
  );
}

function SortableOption({
  option,
  onLabelChange,
  onRemove,
}: {
  option: DraftFieldOption;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex h-9 min-w-0 items-center gap-2 rounded-[8px] border border-border-strong bg-bg-surface px-2.5',
        isDragging ? 'relative z-10 shadow-lg' : '',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label="Arrastar opção"
        className="shrink-0 cursor-grab text-tx-ph active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={option.displayLabel}
        onChange={(event) => onLabelChange(event.target.value)}
        placeholder="Rótulo da opção"
        aria-label="Rótulo da opção"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-tx-primary outline-none placeholder:text-tx-ph"
      />
      <button
        type="button"
        aria-label="Remover opção"
        onClick={onRemove}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-tx-ph hover:bg-[#fff1f1] hover:text-error"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Opções de seleção em grade de duas colunas, reordenáveis arrastando o grip. */
function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: DraftFieldOption[];
  onChange: (options: DraftFieldOption[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = options.findIndex((option) => option.id === active.id);
    const toIndex = options.findIndex((option) => option.id === over.id);
    if (fromIndex >= 0 && toIndex >= 0) onChange(arrayMove(options, fromIndex, toIndex));
  }

  return (
    <>
      {options.length === 0 ? (
        <p className="text-xs text-tx-ph">Nenhuma opção ainda.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={options.map((option) => option.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-2">
              {options.map((option, optionIndex) => (
                <SortableOption
                  key={option.id}
                  option={option}
                  onLabelChange={(label) =>
                    onChange(
                      options.map((item, itemIndex) =>
                        itemIndex === optionIndex ? { ...item, displayLabel: label } : item,
                      ),
                    )
                  }
                  onRemove={() => onChange(options.filter((_, itemIndex) => itemIndex !== optionIndex))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 [&>div]:basis-full">
        <button
          type="button"
          onClick={() =>
            onChange([...options, createDraftFieldOption(`Opção ${options.length + 1}`, options)])
          }
          className="w-fit text-xs font-bold text-primary dark:text-blue-300"
        >
          + Adicionar opção
        </button>
        <PasteOptions
          noun="opções"
          existingLabels={options.map((option) => option.displayLabel)}
          onAdd={(labels) => {
            const next = [...options];
            for (const label of labels) next.push(createDraftFieldOption(label, next));
            onChange(next);
          }}
        />
      </div>
    </>
  );
}

/** Linha recolhida: grip, posição, tipo, rótulo e código, nome do tipo, badges e chevron. */
function FieldRowHeader({
  field,
  position,
  expanded,
  onToggle,
  dragHandle,
}: {
  field: DraftField;
  position: number;
  expanded: boolean;
  onToggle: () => void;
  dragHandle: ReactNode;
}) {
  const Icon = fieldTypeIconOf(field.fieldType, field.settingsJson);
  const typeName = fieldTypeChoiceLabel(field.fieldType, field.settingsJson);
  const isTitle = field.fieldType === 'title';
  const required = field.required && !isDecorativeFieldType(field.fieldType);
  const conditional = hasVisibilityConditions(field);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${field.label || 'Campo sem rótulo'} — ${typeName}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      className={[
        'grid cursor-pointer grid-cols-[18px_24px_34px_minmax(0,1fr)_20px] items-center gap-3 px-4 py-[9px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
        'min-[1100px]:grid-cols-[18px_24px_34px_minmax(0,1fr)_190px_260px_20px]',
        expanded ? 'bg-bg-s2' : 'hover:bg-bg-s2',
      ].join(' ')}
    >
      {dragHandle}
      <span className="text-xs font-semibold tabular-nums text-tx-ph">
        {String(position).padStart(2, '0')}
      </span>
      <span
        className={[
          'grid h-[34px] w-[34px] place-items-center rounded-[8px]',
          isTitle ? 'bg-primary text-white' : 'bg-bg-s3 text-primary dark:text-blue-300',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            className={[
              'truncate text-sm leading-[18px]',
              isTitle ? 'font-extrabold' : 'font-semibold',
              field.label ? 'text-tx-primary' : 'text-tx-ph',
            ].join(' ')}
          >
            {field.label || 'Campo sem rótulo'}
          </p>
          {/* Tela estreita: os badges viram ícones ao lado do rótulo. */}
          <span className="flex shrink-0 items-center gap-1 min-[1100px]:hidden">
            {required ? (
              <span title="Obrigatório" className={`grid h-4 w-4 place-items-center rounded-full ${primarySoftChip}`}>
                <Asterisk className="h-2.5 w-2.5" />
              </span>
            ) : null}
            {conditional ? (
              <span title="Condicional" className={`grid h-4 w-4 place-items-center rounded-full ${amberChip}`}>
                <Filter className="h-2.5 w-2.5" />
              </span>
            ) : null}
            {field.isSensitive ? (
              <span title="Sensível" className={`grid h-4 w-4 place-items-center rounded-full ${amberChip}`}>
                <Lock className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </span>
        </div>
        <p className="mt-px truncate font-mono text-[11px] leading-[14px] text-tx-muted">{field.code}</p>
        <p className="truncate text-xs text-tx-secondary min-[1100px]:hidden">{typeName}</p>
      </div>
      <span className="hidden truncate text-[13px] text-tx-secondary min-[1100px]:block">{typeName}</span>
      <span className="hidden min-w-0 items-center justify-end gap-1.5 min-[1100px]:flex">
        {required ? <Badge className={primarySoftChip}>Obrigatório</Badge> : null}
        {conditional ? (
          <Badge className={amberChip} icon={<Filter className="h-[11px] w-[11px]" />}>
            Condicional
          </Badge>
        ) : null}
        {field.isSensitive ? (
          <Badge className={amberChip} icon={<Lock className="h-[11px] w-[11px]" />}>
            Sensível
          </Badge>
        ) : null}
      </span>
      <Chevron className="h-4 w-4 text-tx-secondary" />
    </div>
  );
}

function OptionBox({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border-default bg-bg-s2 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-tx-primary">{title}</p>
        <p className="text-xs text-tx-secondary">{subtitle}</p>
      </div>
      <SwitchControl checked={checked} disabled={disabled} onChange={onChange} label={title} />
    </div>
  );
}

const actionButton =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-bold transition-colors';

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        actionButton,
        active
          ? 'border-primary bg-bg-hover text-primary dark:border-blue-300 dark:text-blue-300'
          : 'border-border-strong text-tx-secondary hover:bg-bg-hover',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

export function BuilderWizardFieldRow({
  field,
  formId = null,
  position,
  availableFields,
  phaseOptions = null,
  sectionFieldCodes,
  sectionQuestions = [],
  sectionScoreFields = [],
  erpTableDependencyFields = [],
  onCreateErpTableParameterField,
  expanded,
  onToggleExpanded,
  onOpenTypePicker,
  onDuplicate,
  onChange,
  onRemove,
  canRemove,
}: BuilderWizardFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const [openEditor, setOpenEditor] = useState<FieldEditor | null>(() => initialEditor(field));

  const showOptions = supportsOptions(field.fieldType);
  const showSettings = supportsAdvancedSettings(field.fieldType);
  const rules = useMemo(
    () => (Array.isArray(field.conditionsJson.show_if) ? field.conditionsJson.show_if : []),
    [field.conditionsJson.show_if],
  );
  const visibilityRule = useMemo(
    () => getOrCreateRule(field.visibilityRules),
    [field.visibilityRules],
  );

  useEffect(() => {
    if (!showSettings) {
      setOpenEditor((current) => (current === 'settings' ? null : current));
    }
  }, [showSettings]);

  const toggleEditor = (editor: FieldEditor) =>
    setOpenEditor((current) => (current === editor ? null : editor));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const settings = field.settingsJson;
  const isDecorative = isDecorativeFieldType(field.fieldType);
  const productTableCreatorColumns = (settings.productTableColumns ?? DEFAULT_PRODUCT_TABLE_COLUMNS).filter(
    (column) => column.filledBy === 'creator',
  );
  const TypeIcon = fieldTypeIconOf(field.fieldType, settings);

  const isListField = LIST_FIELD_TYPES.includes(field.fieldType);
  const linkedListId = isListField ? readItemListId(settings) : null;


  /** Liga o campo a uma lista: as opções viram os itens ativos (as já salvas ficam escondidas). */
  function linkToList(list: ItemListDetail) {
    const saved = field.options
      .filter((option) => SAVED_OPTION_ID.test(option.id))
      .map((option) => ({ value: option.internalValue, label: option.displayLabel }));
    const synced = linkOptions(saved, list);
    const idByValue = new Map(field.options.map((option) => [option.internalValue, option.id]));
    onChange(
      'options',
      synced.options.map((option) => ({
        id: idByValue.get(option.value) ?? createLocalId('option'),
        internalValue: option.value,
        displayLabel: option.label,
      })),
    );
    onChange('settingsJson', linkSettings(settings, list.id, synced.hidden));
  }

  /** Volta a digitar: ficam as opções visíveis, agora editáveis no próprio campo. */
  function unlinkList() {
    onChange('options', visibleOptions(field.options, settings, (o) => o.internalValue));
    onChange('settingsJson', linkSettings(settings, null));
  }

  // Tabela de produtos: lista em uma coluna, com os valores fixos de cada produto.
  const productOptions = (
    <>
      {field.options.length === 0 ? (
        <p className="text-xs text-tx-ph">
          {field.fieldType === 'product_table' ? 'Nenhum produto ainda.' : 'Nenhuma opção ainda.'}
        </p>
      ) : (
        <div className="grid gap-2">
          {field.options.map((option, optionIndex) => {
            return (
              <div key={option.id} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Mover item para cima"
                    disabled={optionIndex === 0}
                    onClick={() => {
                      const next = [...field.options];
                      [next[optionIndex - 1], next[optionIndex]] = [
                        next[optionIndex],
                        next[optionIndex - 1],
                      ];
                      onChange('options', next);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tx-secondary hover:bg-bg-hover disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover item para baixo"
                    disabled={optionIndex === field.options.length - 1}
                    onClick={() => {
                      const next = [...field.options];
                      [next[optionIndex], next[optionIndex + 1]] = [
                        next[optionIndex + 1],
                        next[optionIndex],
                      ];
                      onChange('options', next);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tx-secondary hover:bg-bg-hover disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <input
                    value={option.displayLabel}
                    onChange={(event) => {
                      const next = field.options.map((item, itemIndex) =>
                        itemIndex === optionIndex
                          ? { ...item, displayLabel: event.target.value }
                          : item,
                      );
                      onChange('options', next);
                    }}
                    placeholder={
                      field.fieldType === 'product_table' ? 'Nome do produto' : 'Rótulo da opção'
                    }
                    className="h-9 min-w-0 flex-1 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    aria-label="Remover item"
                    onClick={() =>
                      onChange(
                        'options',
                        field.options.filter((_, itemIndex) => itemIndex !== optionIndex),
                      )
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-[#fff1f1] hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {field.fieldType === 'product_table' && productTableCreatorColumns.length > 0 ? (
                  <div className="ml-16 flex flex-wrap items-center gap-2">
                    {productTableCreatorColumns.map((column) => (
                      <label
                        key={column.id}
                        className="grid gap-1 text-[11px] font-semibold text-tx-secondary"
                      >
                        {column.label}
                        <input
                          type={column.type === 'number' ? 'number' : 'text'}
                          value={settings.productTableProductValues?.[option.internalValue]?.[column.id] ?? ''}
                          onChange={(event) => {
                            const raw = event.target.value;
                            const current = settings.productTableProductValues ?? {};
                            const currentForProduct = { ...(current[option.internalValue] ?? {}) };
                            if (raw === '') {
                              delete currentForProduct[column.id];
                            } else {
                              currentForProduct[column.id] =
                                column.type === 'number' ? Number(raw) : raw;
                            }
                            onChange('settingsJson', {
                              ...settings,
                              productTableProductValues: {
                                ...current,
                                [option.internalValue]: currentForProduct,
                              },
                            });
                          }}
                          placeholder={column.label}
                          className="h-8 w-28 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-xs text-tx-primary outline-none focus:border-primary"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          onChange('options', [
            ...field.options,
            createDraftFieldOption(
              field.fieldType === 'product_table'
                ? `Produto ${field.options.length + 1}`
                : `Opção ${field.options.length + 1}`,
              field.options,
            ),
          ])
        }
        className="mt-1 w-fit text-xs font-bold text-primary"
      >
        {field.fieldType === 'product_table' ? '+ Adicionar produto' : '+ Adicionar opção'}
      </button>
      <PasteOptions
        noun={field.fieldType === 'product_table' ? 'produtos' : 'opções'}
        existingLabels={field.options.map((option) => option.displayLabel)}
        onAdd={(labels) => {
          const next = [...field.options];
          for (const label of labels) next.push(createDraftFieldOption(label, next));
          onChange('options', next);
        }}
      />
    </>
  );

  const fieldLabelClass = 'grid gap-1.5 text-xs font-bold text-tx-secondary';
  const inputClass =
    'h-[38px] w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary';

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-field-row-id={field.id}
      className={[
        'overflow-hidden rounded-[10px] border bg-bg-surface',
        expanded
          ? 'border-primary shadow-[0_0_0_3px_rgba(26,60,143,.12),0_8px_24px_rgba(13,29,41,.08)]'
          : 'border-border-strong',
        isDragging ? 'relative z-10 shadow-lg ring-2 ring-primary/30' : '',
      ].join(' ')}
    >
      <FieldRowHeader
        field={field}
        position={position}
        expanded={expanded}
        onToggle={onToggleExpanded}
        dragHandle={
          <button
            type="button"
            aria-label="Arrastar para reordenar"
            // O grip só arrasta: não abre nem fecha a linha.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="grid h-[18px] w-[18px] cursor-grab place-items-center text-tx-ph active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />

      {expanded ? (
        <AccordionPanel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-border-default px-4 pb-[22px] pt-5 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] min-[900px]:pl-[104px] min-[900px]:pr-6">
            <div className="grid content-start gap-3.5">
              <label className={fieldLabelClass}>
                Rótulo
                <AutoGrowLabelInput
                  value={field.label}
                  onChange={(value) => onChange('label', value)}
                  placeholder="Rótulo do campo"
                  className="min-h-[38px] w-full rounded-[8px] border border-border-strong bg-bg-surface px-3 py-[8px] text-sm font-semibold leading-snug text-tx-primary outline-none focus:border-primary"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className={fieldLabelClass}>
                  Tipo
                  <button
                    type="button"
                    aria-label="Tipo do campo"
                    aria-haspopup="dialog"
                    data-type-picker-trigger=""
                    onClick={onOpenTypePicker}
                    className="flex h-[38px] min-w-0 items-center gap-2 rounded-[8px] bg-bg-hover px-3 text-sm font-normal text-tx-primary"
                  >
                    <TypeIcon className="h-[15px] w-[15px] shrink-0 text-primary dark:text-blue-300" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {fieldTypeChoiceLabel(field.fieldType, settings)}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-tx-secondary" />
                  </button>
                </div>
                <label className={fieldLabelClass}>
                  Código
                  {/* Gerado a partir do rótulo (o reducer o recalcula a cada edição do rótulo). */}
                  <input
                    value={field.code}
                    readOnly
                    title="Gerado a partir do rótulo"
                    className={`${inputClass} bg-bg-s2 font-mono text-[13px] font-normal text-tx-secondary`}
                  />
                </label>
              </div>

              {field.fieldType === 'file_download' ? (
                <DownloadFileEditor
                  formId={formId}
                  file={settings.downloadFile}
                  onChange={(downloadFile) =>
                    onChange('settingsJson', downloadFile ? { downloadFile } : {})
                  }
                />
              ) : null}

              {field.fieldType === 'email' && settings.userSuggestions ? (
                <UserEmailSettingsEditor
                  settings={settings}
                  onChange={(next) => onChange('settingsJson', next)}
                />
              ) : null}
            </div>

            <div className="grid content-start gap-2.5">
              <OptionBox
                title="Obrigatório"
                subtitle="Bloqueia o envio se vazio"
                checked={field.required}
                disabled={isDecorative}
                onChange={(checked) => onChange('required', checked)}
              />
              <OptionBox
                title="Campo sensível"
                subtitle="Mascarado para quem não tem permissão"
                checked={field.isSensitive}
                onChange={(checked) => onChange('isSensitive', checked)}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ActionButton
                  icon={<Filter className="h-[13px] w-[13px]" />}
                  label="Visibilidade"
                  active={openEditor === 'visibility'}
                  onClick={() => toggleEditor('visibility')}
                />
                <ActionButton
                  icon={<Sparkles className="h-[13px] w-[13px]" />}
                  label="Condições"
                  active={openEditor === 'conditions'}
                  onClick={() => toggleEditor('conditions')}
                />
                {showSettings ? (
                  <ActionButton
                    icon={<Settings2 className="h-[13px] w-[13px]" />}
                    label="Configurações"
                    active={openEditor === 'settings'}
                    onClick={() => toggleEditor('settings')}
                  />
                ) : null}
                {onDuplicate ? (
                  <ActionButton
                    icon={<Copy className="h-[13px] w-[13px]" />}
                    label="Duplicar"
                    onClick={onDuplicate}
                  />
                ) : null}
                {canRemove ? (
                  <button
                    type="button"
                    onClick={onRemove}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-bold text-error hover:bg-[#fff1f1] dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-[13px] w-[13px]" />
                    Remover
                  </button>
                ) : null}
              </div>
            </div>


            {openEditor === 'settings' && showSettings ? (
              <div className="col-span-full grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
                  Configurações avançadas
                </p>

                {field.fieldType === 'number' ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <NumberSettingInput
                      label="Valor mínimo"
                      value={settings.min}
                      onChange={(value) => onChange('settingsJson', { ...settings, min: value })}
                    />
                    <NumberSettingInput
                      label="Valor máximo"
                      value={settings.max}
                      onChange={(value) => onChange('settingsJson', { ...settings, max: value })}
                    />
                    <NumberSettingInput
                      label="Casas decimais"
                      value={settings.decimals}
                      onChange={(value) => onChange('settingsJson', { ...settings, decimals: value })}
                    />
                  </div>
                ) : null}

                {(field.fieldType === 'scale' || field.fieldType === 'rating') && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberSettingInput
                      label="Valor máximo"
                      value={settings.max}
                      onChange={(value) => onChange('settingsJson', { ...settings, max: value })}
                    />
                  </div>
                )}

                {field.fieldType === 'short_text' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberSettingInput
                      label="Tamanho mínimo"
                      value={settings.minLength}
                      onChange={(value) => onChange('settingsJson', { ...settings, minLength: value })}
                    />
                    <NumberSettingInput
                      label="Tamanho máximo"
                      value={settings.maxLength}
                      onChange={(value) => onChange('settingsJson', { ...settings, maxLength: value })}
                    />
                  </div>
                ) : null}

                {field.fieldType === 'long_text' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberSettingInput
                      label="Tamanho máximo"
                      value={settings.maxLength}
                      onChange={(value) => onChange('settingsJson', { ...settings, maxLength: value })}
                    />
                  </div>
                ) : null}

                {field.fieldType === 'date' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-xs font-semibold text-tx-secondary">
                      Data mínima
                      <input
                        type="date"
                        value={settings.minDate ?? ''}
                        onChange={(event) =>
                          onChange('settingsJson', {
                            ...settings,
                            minDate: event.target.value || undefined,
                          })
                        }
                        className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                      />
                    </label>
                    <label className="grid gap-2 text-xs font-semibold text-tx-secondary">
                      Data máxima
                      <input
                        type="date"
                        value={settings.maxDate ?? ''}
                        onChange={(event) =>
                          onChange('settingsJson', {
                            ...settings,
                            maxDate: event.target.value || undefined,
                          })
                        }
                        className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                ) : null}

                {field.fieldType === 'file_upload' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <p className="text-xs text-tx-secondary md:col-span-2">
                      Sem limite de quantidade nem de tamanho. Fotos são otimizadas no envio para ocupar menos espaço.
                    </p>
                    <label className="flex items-start gap-2 text-xs font-semibold text-tx-secondary md:col-span-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={settings.requireFileLabel !== false}
                        onChange={(event) =>
                          onChange('settingsJson', { ...settings, requireFileLabel: event.target.checked })
                        }
                      />
                      <span>
                        Exigir nome ou descrição em cada arquivo
                        <span className="block font-normal">
                          Quem envia precisa renomear o arquivo ou dizer o que ele é.
                        </span>
                      </span>
                    </label>
                    <div className="grid gap-2 text-xs font-semibold text-tx-secondary md:col-span-2">
                      Tipos permitidos
                      {(
                        [
                          { label: 'PDF', mimes: ['application/pdf'] },
                          { label: 'Imagens (JPG/PNG)', mimes: ['image/jpeg', 'image/png'] },
                          {
                            label: 'Excel',
                            mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
                          },
                          {
                            label: 'Word',
                            mimes: [
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            ],
                          },
                        ] as const
                      ).map(({ label, mimes }) => {
                        const current = settings.allowedMimeTypes ?? [];
                        const checked = mimes.every((m) => current.includes(m));
                        return (
                          <label key={label} className="flex items-center gap-2 font-normal">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const next = new Set(current);
                                if (event.target.checked) {
                                  mimes.forEach((m) => next.add(m));
                                } else {
                                  mimes.forEach((m) => next.delete(m));
                                }
                                onChange('settingsJson', {
                                  ...settings,
                                  allowedMimeTypes: Array.from(next),
                                });
                              }}
                            />
                            {label}
                          </label>
                        );
                      })}
                      <label className="flex items-center gap-2 font-normal">
                        <input
                          type="checkbox"
                          checked={[
                            'application/pdf',
                            'image/jpeg',
                            'image/png',
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          ].every((m) => (settings.allowedMimeTypes ?? []).includes(m))}
                          onChange={(event) => {
                            const all = [
                              'application/pdf',
                              'image/jpeg',
                              'image/png',
                              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            ];
                            onChange('settingsJson', {
                              ...settings,
                              allowedMimeTypes: event.target.checked ? all : [],
                            });
                          }}
                        />
                        Todos
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-tx-secondary md:col-span-2">
                      <input
                        type="checkbox"
                        checked={settings.validateLabelWithAi ?? false}
                        onChange={(event) =>
                          onChange('settingsJson', { ...settings, validateLabelWithAi: event.target.checked })
                        }
                      />
                      Validar etiqueta com IA (lote/fabricação/validade)
                    </label>
                  </div>
                ) : null}

                {field.fieldType === 'calculated' ? (
                  <label className="flex items-start gap-2 rounded-[8px] border border-border-strong px-3 py-2.5 text-sm text-tx-primary">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!settings.hideFromRespondent}
                      onChange={(event) =>
                        onChange('settingsJson', {
                          ...settings,
                          hideFromRespondent: event.target.checked ? undefined : true,
                        })
                      }
                    />
                    <span className="grid gap-0.5">
                      <span className="font-semibold">Mostrar para quem responde</span>
                      <span className="text-xs text-tx-secondary">
                        Desligado: o valor é calculado e gravado no envio, mas só aparece para quem
                        consulta a resposta (e o card). Seção só com campos ocultos não aparece para
                        quem responde.
                      </span>
                    </span>
                  </label>
                ) : null}

                {scoreModeOf(field) === 'section' ? (
                  <SectionScoreEditor
                    settings={field.settingsJson}
                    questions={sectionQuestions}
                    onChangeSettings={(next) => onChange('settingsJson', next)}
                  />
                ) : scoreModeOf(field) === 'result' ? (
                  <ScoreResultEditor
                    fieldCode={field.code}
                    settings={field.settingsJson}
                    sectionScores={sectionScoreFields}
                    // Lista ou texto curto: a resposta identifica a auditoria (ex.: a unidade) no aviso.
                    labelFieldOptions={availableFields
                      .filter((item) => item.fieldType === 'single_select' || item.fieldType === 'short_text')
                      .map((item) => ({ code: item.code, label: item.label }))}
                    onChangeSettings={(next) => onChange('settingsJson', next)}
                  />
                ) : field.fieldType === 'calculated' ? (
                  <FormulaEditor
                    fieldCode={field.code}
                    settings={field.settingsJson}
                    availableFields={availableFields}
                    phaseOptions={phaseOptions}
                    sectionFieldCodes={sectionFieldCodes}
                    onChangeSettings={(next) => onChange('settingsJson', next)}
                  />
                ) : null}

                {field.fieldType === 'product_table' ? (
                  <ProductTableColumnsEditor
                    columns={settings.productTableColumns ?? DEFAULT_PRODUCT_TABLE_COLUMNS}
                    onChange={(columns) => onChange('settingsJson', { ...settings, productTableColumns: columns })}
                  />
                ) : null}

                {field.fieldType === 'erp_lookup' ? (
                  <ErpLookupSettingsEditor
                    settings={settings}
                    onChange={(next) => onChange('settingsJson', next)}
                  />
                ) : null}

                {field.fieldType === 'item_order' ? (
                  <ItemOrderSettingsEditor
                    settings={settings}
                    onChange={(next) => onChange('settingsJson', next)}
                  />
                ) : null}

                {field.fieldType === 'erp_table' ? (
                  <ErpTableSettingsEditor
                    settings={settings}
                    dependencyFields={erpTableDependencyFields}
                    onChange={(next) => onChange('settingsJson', next)}
                    onCreateDependencyField={onCreateErpTableParameterField}
                  />
                ) : null}
              </div>
            ) : null}

            {openEditor === 'conditions' ? (
              <div className="col-span-full grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Condições de exibição
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        'conditionsJson',
                        updateConditionValue(field.conditionsJson, (current) => [
                          ...current,
                          { fieldCode: availableFields[0]?.code ?? '', operator: 'equals', value: '' },
                        ]),
                      )
                    }
                    className="text-xs font-bold text-primary"
                  >
                    Adicionar condição
                  </button>
                </div>

                {rules.length === 0 ? (
                  <p className="text-xs text-[#7a5e2b]">Sem condições. O campo sempre fica visível.</p>
                ) : (
                  <div className="grid gap-3">
                    {rules.map((rule, index) => (
                      <div
                        key={`${field.id}_condition_${index}`}
                        className="grid gap-3 rounded-[10px] border border-[#f3e3bb] bg-bg-surface p-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_36px]"
                      >
                        <select
                          value={rule.fieldCode}
                          onChange={(event) =>
                            onChange(
                              'conditionsJson',
                              updateConditionValue(field.conditionsJson, (current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, fieldCode: event.target.value } : item,
                                ),
                              ),
                            )
                          }
                          className="h-9 rounded-[8px] border border-[#f3e3bb] bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                        >
                          {availableFields.map((availableField) => (
                            <option key={availableField.code} value={availableField.code}>
                              {availableField.label} ({availableField.code})
                            </option>
                          ))}
                        </select>

                        <select
                          value={rule.operator}
                          onChange={(event) =>
                            onChange(
                              'conditionsJson',
                              updateConditionValue(field.conditionsJson, (current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, operator: event.target.value as FieldConditionOperator }
                                    : item,
                                ),
                              ),
                            )
                          }
                          className="h-9 rounded-[8px] border border-[#f3e3bb] bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                        >
                          {conditionOperators.map((operator) => (
                            <option key={operator.value} value={operator.value}>
                              {operator.label}
                            </option>
                          ))}
                        </select>

                        {rule.operator === 'is_empty' || rule.operator === 'is_not_empty' ? (
                          <div className="h-9 rounded-[8px] border border-dashed border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20" />
                        ) : (
                          <input
                            value={typeof rule.value === 'string' ? rule.value : String(rule.value ?? '')}
                            onChange={(event) =>
                              onChange(
                                'conditionsJson',
                                updateConditionValue(field.conditionsJson, (current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, value: event.target.value } : item,
                                  ),
                                ),
                              )
                            }
                            placeholder="Valor esperado"
                            className="h-9 rounded-[8px] border border-[#f3e3bb] bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            onChange(
                              'conditionsJson',
                              updateConditionValue(field.conditionsJson, (current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              ),
                            )
                          }
                          className="grid h-9 w-9 place-items-center rounded-[8px] text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {openEditor === 'visibility' ? (
              <div className="col-span-full grid gap-4 rounded-[10px] border border-border-default bg-bg-s2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Lógica condicional
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const newCondition: VisibilityCondition = {
                        fieldCode: availableFields[0]?.code ?? '',
                        operator: 'equals',
                        value: '',
                      };
                      onChange(
                        'visibilityRules',
                        setRule(field.visibilityRules, (rule) => ({
                          ...rule,
                          conditions: [...rule.conditions, newCondition],
                        })),
                      );
                    }}
                    className="text-xs font-bold text-primary"
                  >
                    + Adicionar condição
                  </button>
                </div>

                <p className="text-xs text-tx-secondary">Este campo aparece quando...</p>

                {visibilityRule.conditions.length === 0 ? (
                  <p className="text-xs text-tx-secondary">Sem condições. O campo sempre fica visível.</p>
                ) : (
                  <div className="grid gap-2">
                    {visibilityRule.conditions.map((condition, index) => {
                      const referencedField = availableFields.find((f) => f.code === condition.fieldCode);
                      const operators = referencedField
                        ? getVisibilityOperators(referencedField.fieldType)
                        : allVisibilityOperators;
                      const noValue =
                        condition.operator === 'is_empty' || condition.operator === 'is_not_empty';
                      return (
                        <div
                          key={`${field.id}_vrule_${index}`}
                          className="grid gap-2 rounded-[10px] border border-border-strong bg-bg-surface p-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_36px]"
                        >
                          <select
                            value={condition.fieldCode}
                            onChange={(event) =>
                              onChange(
                                'visibilityRules',
                                setRule(field.visibilityRules, (rule) => ({
                                  ...rule,
                                  conditions: rule.conditions.map((c, i) =>
                                    i === index
                                      ? {
                                          ...c,
                                          fieldCode: event.target.value,
                                          operator: 'equals',
                                          value: '',
                                        }
                                      : c,
                                  ),
                                })),
                              )
                            }
                            className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                          >
                            {availableFields.map((af) => (
                              <option key={af.code} value={af.code}>
                                {af.label} ({af.code})
                              </option>
                            ))}
                          </select>

                          <select
                            value={condition.operator}
                            onChange={(event) =>
                              onChange(
                                'visibilityRules',
                                setRule(field.visibilityRules, (rule) => ({
                                  ...rule,
                                  conditions: rule.conditions.map((c, i) =>
                                    i === index
                                      ? {
                                          ...c,
                                          operator: event.target.value as VisibilityConditionOperator,
                                        }
                                      : c,
                                  ),
                                })),
                              )
                            }
                            className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                          >
                            {operators.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>

                          {noValue ? (
                            <div className="h-9 rounded-[8px] border border-dashed border-border-strong bg-bg-s2" />
                          ) : (
                            <input
                              value={condition.value === undefined ? '' : String(condition.value)}
                              onChange={(event) =>
                                onChange(
                                  'visibilityRules',
                                  setRule(field.visibilityRules, (rule) => ({
                                    ...rule,
                                    conditions: rule.conditions.map((c, i) =>
                                      i === index ? { ...c, value: event.target.value } : c,
                                    ),
                                  })),
                                )
                              }
                              placeholder="Valor"
                              className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                            />
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                'visibilityRules',
                                setRule(field.visibilityRules, (rule) => ({
                                  ...rule,
                                  conditions: rule.conditions.filter((_, i) => i !== index),
                                })),
                              )
                            }
                            className="grid h-9 w-9 place-items-center rounded-[8px] text-tx-secondary hover:bg-[#fff1f1] hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {visibilityRule.conditions.length > 1 ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-tx-secondary">
                      Combinar condições com:
                    </span>
                    {(['and', 'or'] as const).map((op) => (
                      <label
                        key={op}
                        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-tx-primary"
                      >
                        <input
                          type="radio"
                          name={`${field.id}_vrule_op`}
                          checked={visibilityRule.operator === op}
                          onChange={() =>
                            onChange(
                              'visibilityRules',
                              setRule(field.visibilityRules, (rule) => ({ ...rule, operator: op })),
                            )
                          }
                          className="accent-primary"
                        />
                        {op === 'and' ? 'E todas (AND)' : 'OU qualquer (OR)'}
                      </label>
                    ))}
                  </div>
                ) : null}

                {visibilityRule.conditions.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-tx-secondary">Ação:</span>
                    {(['show', 'hide'] as const).map((action) => (
                      <label
                        key={action}
                        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-tx-primary"
                      >
                        <input
                          type="radio"
                          name={`${field.id}_vrule_action`}
                          checked={visibilityRule.action === action}
                          onChange={() =>
                            onChange(
                              'visibilityRules',
                              setRule(field.visibilityRules, (rule) => ({ ...rule, action })),
                            )
                          }
                          className="accent-primary"
                        />
                        {action === 'show' ? 'Mostrar este campo' : 'Ocultar este campo'}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showOptions ? (
              <div className="col-span-full grid gap-3 border-t border-dashed border-border-strong pt-4">
                <p className="text-xs font-bold text-tx-secondary">
                  {field.fieldType === 'product_table' ? 'Produtos' : 'Opções'}
                </p>
                {field.fieldType === 'product_table' ? (
                  <>
                    <p className="text-xs text-tx-ph">
                      Quem responder verá esta lista de produtos com as colunas marcadas como &quot;Quem
                      responde&quot; editáveis — o nome e as colunas marcadas como &quot;fixo por
                      produto&quot; não podem ser alterados na hora de responder.
                    </p>
                    {productOptions}
                  </>
                ) : isListField ? (
                  <ItemListSource
                    listId={linkedListId}
                    visibleLabels={visibleOptions(field.options, settings, (o) => o.internalValue).map(
                      (option) => option.displayLabel,
                    )}
                    hiddenCount={readHiddenOptionValues(settings).size}
                    onLink={linkToList}
                    onUnlink={unlinkList}
                  >
                    <SelectOptionsEditor
                      options={field.options}
                      onChange={(options) => onChange('options', options)}
                    />
                  </ItemListSource>
                ) : (
                  <SelectOptionsEditor
                    options={field.options}
                    onChange={(options) => onChange('options', options)}
                  />
                )}
              </div>
            ) : null}
          </div>
        </AccordionPanel>
      ) : null}
    </div>
  );
}
