import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowDown, ArrowUp, FileDown, GripVertical, Plus, Save, Sheet, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import {
  defaultReportConfig,
  GROUP_LABELS,
  moveItem,
  sanitizeReportConfig,
  fileSlug,
  shortLabel,
  toDayString,
  triggerDownload,
} from '../lib/records-lib';
import {
  createReportTemplate,
  deleteReportTemplate,
  downloadRecordsReport,
  fetchReportTemplates,
  readBlobError,
  updateReportTemplate,
} from '../services/records-api';
import type { RecordColumn, RecordFilters, RecordReportConfig, RecordRow, ReportTemplate } from '../types';

type Props = {
  formId: string;
  formName: string;
  columns: RecordColumn[];
  visibleColumns: string[];
  filters: RecordFilters;
  /** Quantos registros os filtros atuais trazem (o que entra no PDF). */
  total: number;
  maxRows: number;
  /** Registros desta página da tela, para a prévia. */
  sampleRows: RecordRow[];
  onClose: () => void;
};

const inputCls =
  'h-9 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary focus:ring-2 focus:ring-primary/20';
const labelCls = 'grid min-w-0 gap-1 text-xs font-bold uppercase tracking-wide text-tx-secondary';

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

/**
 * Montador do relatório PDF: escolher e ordenar colunas, renomear títulos, agrupar, ordenar, layout.
 * Os registros são os da tela (mesmos filtros). Modelos ficam salvos no processo.
 */
export function ReportBuilderModal({
  formId,
  formName,
  columns,
  visibleColumns,
  filters,
  total,
  maxRows,
  sampleRows,
  onClose,
}: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<RecordReportConfig>(() => defaultReportConfig(formName, visibleColumns));
  const [templateId, setTemplateId] = useState('');
  const [columnQuery, setColumnQuery] = useState('');
  const [generating, setGenerating] = useState<'pdf' | 'csv' | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);

  const columnByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const chosen = new Set(config.columns.map((column) => column.key));
  const patch = (changes: Partial<RecordReportConfig>) => setConfig((current) => ({ ...current, ...changes }));

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && generating === null) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, generating]);

  // ─── Modelos ──────────────────────────────────────────────────────────
  const templatesQuery = useQuery({
    queryKey: queryKeys.records.templates(formId),
    queryFn: () => fetchReportTemplates(formId),
  });
  const templates = templatesQuery.data ?? [];
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const refreshTemplates = () => queryClient.invalidateQueries({ queryKey: queryKeys.records.templates(formId) });

  const createMutation = useMutation({
    mutationFn: (name: string) => createReportTemplate(formId, name, config),
    onSuccess: (template) => {
      void refreshTemplates();
      setTemplateId(template.id);
      setSavingName(null);
      showToast({ title: `Modelo “${template.name}” salvo`, variant: 'success' });
    },
    onError: (error) => showToast({ title: errorMessage(error, 'Não foi possível salvar o modelo.'), variant: 'error' }),
  });
  const updateMutation = useMutation({
    mutationFn: (template: ReportTemplate) => updateReportTemplate(template.id, { config }),
    onSuccess: (template) => {
      void refreshTemplates();
      showToast({ title: `Modelo “${template.name}” atualizado`, variant: 'success' });
    },
    onError: (error) => showToast({ title: errorMessage(error, 'Não foi possível atualizar o modelo.'), variant: 'error' }),
  });
  const deleteMutation = useMutation({
    mutationFn: (template: ReportTemplate) => deleteReportTemplate(template.id),
    onSuccess: () => {
      void refreshTemplates();
      setTemplateId('');
      showToast({ title: 'Modelo excluído', variant: 'success' });
    },
    onError: (error) => showToast({ title: errorMessage(error, 'Não foi possível excluir o modelo.'), variant: 'error' }),
  });

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    const clean = sanitizeReportConfig(template.config, columns);
    setConfig(clean.columns.length ? clean : { ...clean, columns: defaultReportConfig(formName, visibleColumns).columns });
    if (clean.columns.length < template.config.columns.length) {
      showToast({
        title: 'Algumas colunas do modelo não existem mais neste processo e ficaram de fora.',
        variant: 'info',
      });
    }
  }

  // ─── Colunas ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = config.columns.findIndex((column) => column.key === active.id);
    const to = config.columns.findIndex((column) => column.key === over.id);
    if (from >= 0 && to >= 0) patch({ columns: arrayMove(config.columns, from, to) });
  }
  const addColumn = (key: string) => patch({ columns: [...config.columns, { key }] });
  const removeColumn = (key: string) =>
    patch({
      columns: config.columns.filter((column) => column.key !== key),
      ...(config.groupBy === key ? { groupBy: null } : {}),
    });
  const renameColumn = (key: string, label: string) =>
    patch({ columns: config.columns.map((column) => (column.key === key ? { key, ...(label ? { label } : {}) } : column)) });

  const available = columns.filter(
    (column) =>
      !chosen.has(column.key) &&
      (!columnQuery.trim() || column.label.toLowerCase().includes(columnQuery.trim().toLowerCase())),
  );

  // ─── Gerar ────────────────────────────────────────────────────────────
  const tooMany = total > maxRows;
  async function generate(format: 'pdf' | 'csv') {
    if (config.columns.length === 0) {
      showToast({ title: 'Escolha ao menos uma coluna para o relatório.', variant: 'error' });
      return;
    }
    setGenerating(format);
    try {
      const day = toDayString(new Date());
      const { blob, filename } = await downloadRecordsReport(formId, filters, config, format, `registros-${fileSlug(formName)}-${day}`);
      triggerDownload(blob, filename);
      showToast({ title: 'Relatório gerado', description: `${filename} · ${total} registro(s).`, variant: 'success' });
    } catch (error) {
      const message = (await readBlobError(error)) ?? 'Não foi possível gerar o relatório agora. Tente novamente.';
      showToast({ title: `Falha ao gerar o ${format.toUpperCase()}`, description: message, variant: 'error' });
    } finally {
      setGenerating(null);
    }
  }

  // Só colunas que o processo tem (o modelo já chega limpo; aqui é a garantia para a lista).
  const reportColumns = config.columns.flatMap((column) => {
    const meta = columnByKey.get(column.key);
    return meta ? [{ ...column, meta }] : [];
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && generating === null) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-builder-title"
        className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl"
      >
        {/* Cabeçalho + modelos */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-3">
          <div className="min-w-0">
            <h2 id="report-builder-title" className="text-lg font-extrabold text-tx-primary">
              Montar relatório
            </h2>
            <p className="text-xs text-tx-secondary">
              Entram os <strong>{total.toLocaleString('pt-BR')}</strong> registro(s) dos filtros da tela.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Modelo salvo"
              value={templateId}
              onChange={(event) => applyTemplate(event.target.value)}
              className={cn(inputCls, 'w-56')}
            >
              <option value="">{templatesQuery.isLoading ? 'Carregando modelos…' : 'Sem modelo (montagem livre)'}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate?.canManage ? (
              <>
                <IconButton
                  label="Atualizar o modelo com a montagem atual"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate(selectedTemplate)}
                >
                  <Save className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Excluir o modelo"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Excluir o modelo “${selectedTemplate.name}”? Ele some para todos do processo.`)) {
                      deleteMutation.mutate(selectedTemplate);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </>
            ) : null}
            {savingName === null ? (
              <button
                type="button"
                onClick={() => setSavingName(selectedTemplate ? `${selectedTemplate.name} (cópia)` : '')}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-default px-3 text-sm font-semibold text-tx-secondary hover:border-primary hover:text-primary dark:hover:text-blue-300"
              >
                <Plus className="h-4 w-4" />
                Salvar como modelo
              </button>
            ) : (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (savingName.trim()) createMutation.mutate(savingName.trim());
                }}
              >
                <input
                  autoFocus
                  value={savingName}
                  onChange={(event) => setSavingName(event.target.value)}
                  placeholder="Nome do modelo"
                  aria-label="Nome do modelo"
                  maxLength={120}
                  className={cn(inputCls, 'w-48')}
                />
                <button
                  type="submit"
                  disabled={!savingName.trim() || createMutation.isPending}
                  className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
                <IconButton label="Cancelar" onClick={() => setSavingName(null)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </form>
            )}
            <IconButton label="Fechar" onClick={onClose} disabled={generating !== null}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
          {/* Colunas */}
          <section className="grid min-h-0 content-start gap-4 border-b border-border-default p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="grid gap-2">
              <h3 className="text-sm font-extrabold text-tx-primary">
                Colunas do relatório <span className="font-semibold text-tx-muted">({reportColumns.length})</span>
              </h3>
              <p className="text-xs text-tx-secondary">Arraste para ordenar. O título pode ser trocado só no PDF.</p>
              {reportColumns.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-default p-3 text-xs text-tx-muted">
                  Nenhuma coluna. Adicione abaixo.
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={reportColumns.map((column) => column.key)} strategy={verticalListSortingStrategy}>
                    <ol className="grid gap-1.5">
                      {reportColumns.map((column, index) => (
                        <SortableColumn
                          key={column.key}
                          id={column.key}
                          column={column.meta}
                          label={column.label ?? ''}
                          first={index === 0}
                          last={index === reportColumns.length - 1}
                          onRename={(label) => renameColumn(column.key, label)}
                          onRemove={() => removeColumn(column.key)}
                          onMove={(delta) => patch({ columns: moveItem(config.columns, index, index + delta) })}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            <div className="grid gap-2 border-t border-border-default pt-3">
              <h3 className="text-sm font-extrabold text-tx-primary">Adicionar coluna</h3>
              <input
                type="search"
                value={columnQuery}
                onChange={(event) => setColumnQuery(event.target.value)}
                placeholder="Procurar…"
                aria-label="Procurar coluna para adicionar"
                className={cn(inputCls, 'h-8 text-xs')}
              />
              {(['system', 'form', 'phase'] as const).map((group) => {
                const list = available.filter((column) => column.group === group);
                if (list.length === 0) return null;
                return (
                  <div key={group} className="grid gap-0.5">
                    <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-tx-muted">{GROUP_LABELS[group]}</p>
                    {list.map((column) => (
                      <button
                        key={column.key}
                        type="button"
                        onClick={() => addColumn(column.key)}
                        className="flex items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm text-tx-secondary hover:bg-bg-hover hover:text-tx-primary"
                      >
                        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="line-clamp-2">{column.label}</span>
                          {column.phaseLabel ? <span className="block text-xs text-tx-muted">{column.phaseLabel}</span> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {available.length === 0 ? <p className="text-xs text-tx-muted">Todas as colunas já estão no relatório.</p> : null}
            </div>
          </section>

          {/* Ajustes + prévia */}
          <section className="grid min-h-0 content-start gap-5 p-4 lg:overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={cn(labelCls, 'sm:col-span-2')}>
                Título
                <input value={config.title} onChange={(event) => patch({ title: event.target.value })} maxLength={160} className={inputCls} />
              </label>
              <label className={cn(labelCls, 'sm:col-span-2')}>
                Subtítulo <span className="font-normal normal-case text-tx-muted">(opcional)</span>
                <input
                  value={config.subtitle}
                  onChange={(event) => patch({ subtitle: event.target.value })}
                  maxLength={300}
                  placeholder="Ex.: Fechamento de novembro"
                  className={inputCls}
                />
              </label>
              <div className={labelCls}>
                Formato
                <Segmented
                  value={config.layout}
                  options={[
                    { value: 'table', label: 'Tabela' },
                    { value: 'cards', label: 'Ficha por registro' },
                  ]}
                  // Ficha rende melhor em retrato (mais fichas por folha); a pessoa ainda pode voltar para paisagem.
                  onChange={(layout) => patch(layout === 'cards' ? { layout, orientation: 'portrait' } : { layout })}
                />
              </div>
              <div className={labelCls}>
                Página
                <Segmented
                  value={config.orientation}
                  options={[
                    { value: 'portrait', label: 'Retrato' },
                    { value: 'landscape', label: 'Paisagem' },
                  ]}
                  onChange={(orientation) => patch({ orientation })}
                />
              </div>
              <label className={labelCls}>
                Agrupar por
                <select
                  value={config.groupBy ?? ''}
                  onChange={(event) => patch({ groupBy: event.target.value || null })}
                  className={inputCls}
                >
                  <option value="">Sem agrupamento</option>
                  <ColumnOptions columns={columns} preferChoice />
                </select>
              </label>
              <label className={labelCls}>
                Ordenar por
                <div className="flex gap-1.5">
                  <select
                    value={config.sortBy ?? ''}
                    onChange={(event) => patch({ sortBy: event.target.value || null })}
                    className={inputCls}
                  >
                    <option value="">Ordem de abertura</option>
                    <ColumnOptions columns={columns} />
                  </select>
                  <select
                    aria-label="Direção da ordem"
                    value={config.sortDir}
                    onChange={(event) => patch({ sortDir: event.target.value as 'asc' | 'desc' })}
                    className={cn(inputCls, 'w-32')}
                  >
                    <option value="asc">Crescente</option>
                    <option value="desc">Decrescente</option>
                  </select>
                </div>
              </label>
              <div className={labelCls}>
                Letra
                <Segmented
                  value={config.fontSize}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'small', label: 'Compacta' },
                  ]}
                  onChange={(fontSize) => patch({ fontSize })}
                />
              </div>
              <div className="grid content-end gap-1.5 text-sm text-tx-primary">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.showSummary}
                    onChange={(event) => patch({ showSummary: event.target.checked })}
                    className="accent-primary"
                  />
                  Resumo com totais no fim
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.showFilters}
                    onChange={(event) => patch({ showFilters: event.target.checked })}
                    className="accent-primary"
                  />
                  Filtros aplicados no cabeçalho
                </label>
              </div>
            </div>

            <ReportPreview config={config} columnByKey={columnByKey} rows={sampleRows} formName={formName} />
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-5 py-3">
          <p className={cn('text-xs', tooMany ? 'font-semibold text-red-600' : 'text-tx-secondary')}>
            {tooMany
              ? `São ${total.toLocaleString('pt-BR')} registros; o PDF aceita até ${maxRows.toLocaleString('pt-BR')}. Filtre por período ou fase.`
              : 'O PDF é gerado no servidor com todos os registros filtrados, não só os desta página.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating !== null}
              className="h-10 rounded-lg px-4 text-sm font-semibold text-tx-secondary hover:bg-bg-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void generate('csv')}
              disabled={generating !== null || tooMany || reportColumns.length === 0 || total === 0}
              title="Mesmas colunas e ordem, em planilha (CSV)"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-default px-4 text-sm font-semibold text-tx-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-blue-300"
            >
              <Sheet className="h-4 w-4" />
              {generating === 'csv' ? 'Gerando…' : 'CSV'}
            </button>
            <button
              type="button"
              onClick={() => void generate('pdf')}
              disabled={generating !== null || tooMany || reportColumns.length === 0 || total === 0}
              title={total === 0 ? 'Nenhum registro com os filtros atuais' : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {generating === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-tx-secondary hover:bg-bg-hover hover:text-tx-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex rounded-lg border border-border-default p-0.5 normal-case tracking-normal">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 flex-1 rounded-md px-2 text-sm font-semibold transition-colors',
            value === option.value ? 'bg-primary text-white' : 'text-tx-secondary hover:bg-bg-hover',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Opções de coluna agrupadas; `preferChoice` põe primeiro as que fazem sentido agrupar. */
function ColumnOptions({ columns, preferChoice }: { columns: RecordColumn[]; preferChoice?: boolean }) {
  const groups = (['system', 'form', 'phase'] as const).map((group) => {
    const list = columns.filter((column) => column.group === group && column.key !== 'sys:code');
    const sorted = preferChoice
      ? [...list.filter((column) => column.filter === 'choice' || column.filter === 'boolean'), ...list.filter((column) => column.filter !== 'choice' && column.filter !== 'boolean')]
      : list;
    return { group, list: sorted };
  });
  return (
    <>
      {groups.map(({ group, list }) =>
        list.length ? (
          <optgroup key={group} label={GROUP_LABELS[group]}>
            {list.map((column) => (
              <option key={column.key} value={column.key}>
                {shortLabel(column.label)}
              </option>
            ))}
          </optgroup>
        ) : null,
      )}
    </>
  );
}

function SortableColumn({
  id,
  column,
  label,
  first,
  last,
  onRename,
  onRemove,
  onMove,
}: {
  id: string;
  column: RecordColumn;
  label: string;
  first: boolean;
  last: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-1.5 py-1.5',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Arrastar ${column.label}`}
        className="cursor-grab touch-none rounded p-0.5 text-tx-muted hover:text-tx-primary active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <input
          value={label}
          onChange={(event) => onRename(event.target.value)}
          placeholder={column.label}
          aria-label={`Título da coluna ${column.label} no PDF`}
          maxLength={120}
          className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-sm text-tx-primary outline-none placeholder:text-tx-primary hover:border-border-default focus:border-primary"
        />
        {label && label !== column.label ? (
          <p className="truncate px-1.5 text-[11px] text-tx-muted" title={column.label}>
            {column.label}
          </p>
        ) : column.phaseLabel ? (
          <p className="truncate px-1.5 text-[11px] text-tx-muted">{column.phaseLabel}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={first}
          aria-label="Subir"
          className="rounded p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={last}
          aria-label="Descer"
          className="rounded p-0.5 text-tx-muted hover:text-tx-primary disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar ${column.label}`}
          className="rounded p-0.5 text-tx-muted hover:text-red-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

const PREVIEW_ROWS = 6;

/**
 * A prévia é uma folha branca mesmo no tema escuro; o global.css pinta `.dark table th/td/tr` e só
 * estilo inline vence aquelas regras.
 */
const PAPER = {
  headRow: { backgroundColor: '#f3f4f6' },
  row: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  cell: { color: '#1f2937', borderColor: '#e5e7eb' },
} as const;

/**
 * Prévia aproximada do PDF com os registros desta página da tela. O PDF de verdade usa todos os
 * filtrados, na ordem escolhida; aqui a amostra segue a ordem da tela e só os grupos são aplicados.
 */
function ReportPreview({
  config,
  columnByKey,
  rows,
  formName,
}: {
  config: RecordReportConfig;
  columnByKey: Map<string, RecordColumn>;
  rows: RecordRow[];
  formName: string;
}) {
  const columns = config.columns.flatMap((column) => {
    const meta = columnByKey.get(column.key);
    return meta ? [{ key: column.key, label: column.label ?? meta.label }] : [];
  });
  const groupLabel = config.groupBy ? columnByKey.get(config.groupBy)?.label : null;
  const body = config.groupBy && columns.length > 1 ? columns.filter((column) => column.key !== config.groupBy) : columns;
  const sample = rows.slice(0, PREVIEW_ROWS);
  const groups = new Map<string, RecordRow[]>();
  for (const row of sample) {
    const key = config.groupBy ? row.values[config.groupBy]?.trim() || '(sem valor)' : '';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const small = config.fontSize === 'small';

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-extrabold text-tx-primary">Prévia</h3>
      <div className="overflow-hidden rounded-xl border border-border-default bg-[#e5e7eb] p-3 dark:bg-[#0b1220]">
        <div
          className={cn(
            'mx-auto overflow-hidden rounded bg-white p-4 text-[#1f2937] shadow',
            config.orientation === 'landscape' ? 'max-w-full' : 'max-w-[560px]',
            small ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          <p className={cn('font-bold', small ? 'text-base' : 'text-lg')}>{config.title || 'Relatório de registros'}</p>
          {config.subtitle ? <p className="text-[#6b7280]">{config.subtitle}</p> : null}
          <p className="text-[#6b7280]">{formName} · gerado agora</p>
          <hr className="my-2 border-[#d1d5db]" />
          {sample.length === 0 ? (
            <p className="italic text-[#6b7280]">Sem registros na página para mostrar.</p>
          ) : (
            [...groups.entries()].map(([group, groupRows]) => (
              <div key={group || 'all'} className="mb-2">
                {groupLabel ? (
                  <p className="mb-1 font-semibold text-[#1e3a8a]">
                    <span className="font-normal text-[#6b7280]">{groupLabel}: </span>
                    {group}
                  </p>
                ) : null}
                {config.layout === 'cards' ? (
                  groupRows.map((row) => (
                    <div key={row.id} className="mb-2 border-b border-[#d1d5db] pb-1">
                      <p className="font-semibold">{row.values[body[0]?.key] || '—'}</p>
                      {body.slice(1).map((column) => (
                        <p key={column.key} className="flex gap-2">
                          <span className="w-1/3 shrink-0 text-[#6b7280]">{column.label}</span>
                          <span className="min-w-0 truncate">{row.values[column.key] || '—'}</span>
                        </p>
                      ))}
                    </div>
                  ))
                ) : (
                  <table className="w-full table-fixed border-collapse">
                    <thead>
                      <tr style={PAPER.headRow}>
                        {body.map((column) => (
                          <th key={column.key} style={PAPER.cell} className="truncate px-1 py-0.5 text-left font-semibold">
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row) => (
                        <tr key={row.id} style={PAPER.row} className="border-b">
                          {body.map((column) => (
                            <td key={column.key} style={PAPER.cell} className="truncate px-1 py-0.5">
                              {row.values[column.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
          {config.showSummary && sample.length ? <p className="mt-1 font-semibold text-[#1e3a8a]">Resumo · Total</p> : null}
        </div>
      </div>
    </div>
  );
}
