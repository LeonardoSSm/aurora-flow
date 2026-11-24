import { ArrowDown, ArrowUp, Check, ChevronDown, ClipboardPaste, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn';
import type { FieldSettings } from '../../forms/types';
import { fieldTypeChoiceOf, type FieldTypeChoice } from '../../builder/types';
import { FormulaEditor, type FormulaAvailableField } from '../../builder/components/formula-editor';
import { ItemOrderSettingsEditor } from '../../builder/components/item-order-settings-editor';
import { UserEmailSettingsEditor } from '../../builder/components/user-email-settings-editor';
import {
  isPhaseFieldTypeAvailable,
  isPhaseLayoutType,
  PHASE_FIELD_TYPE_GROUPS,
  phaseFieldTypeDef,
  applyPhaseTypeChoice,
  phaseTypeHasOptions,
} from '../lib/phase-field-types';
import { slugify } from '../lib/phase-draft';
import { isPhaseHoursSettings, withPhaseCalculatedFormat } from '../lib/phase-formula';
import type { DraftKanbanPhaseField, DraftKanbanPhaseFieldOption } from '../types';
import { ItemListSource } from '../../item-lists/item-list-source';
import {
  LIST_FIELD_TYPES,
  linkOptions,
  linkSettings,
  readHiddenOptionValues,
  readItemListId,
  visibleOptions,
} from '../../item-lists/linked-options';

const inputCls =
  'h-9 w-full min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-sm text-tx-primary outline-none focus:border-primary';
const smallLabelCls = 'text-[11px] font-bold uppercase tracking-wide text-tx-secondary';

/** Valor interno único para uma opção nova, derivado do nome. */
function optionValueFor(label: string, taken: Set<string>): string {
  const base = slugify(label || 'opcao');
  let value = base;
  for (let n = 2; taken.has(value); n += 1) value = `${base}_${n}`;
  return value;
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs font-semibold text-tx-secondary"
    >
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** Seletor visual do tipo: grade agrupada com ícone e uma dica de uso, no lugar do `<select>`. */
export function PhaseFieldTypePicker({
  value,
  onPick,
  onClose,
}: {
  value: FieldTypeChoice;
  onPick: (next: FieldTypeChoice) => void;
  onClose?: () => void;
}) {
  return (
    <div role="listbox" aria-label="Tipo do campo" className="grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-3">
      {onClose ? (
        <div className="flex items-center justify-between">
          <span className={smallLabelCls}>Escolha o tipo</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar seleção de tipo"
            className="grid h-7 w-7 place-items-center rounded-md text-tx-muted hover:bg-bg-hover hover:text-tx-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {PHASE_FIELD_TYPE_GROUPS.map((group) => (
        <div key={group.group} className="grid gap-1.5">
          <p className="text-[11px] font-semibold text-tx-muted">{group.group}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.types.map((type) => {
              const Icon = type.icon;
              const selected = type.value === value;
              return (
                <button
                  key={type.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onPick(type.value)}
                  className={cn(
                    'flex min-w-0 items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 dark:bg-blue-900/40'
                      : 'border-border-default bg-bg-surface hover:border-primary/50 hover:bg-bg-hover',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-[8px]',
                      selected ? 'bg-primary text-white' : 'bg-bg-s2 text-tx-secondary',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-tx-primary">{type.label}</span>
                    <span className="block truncate text-[11px] text-tx-muted">{type.hint}</span>
                  </span>
                  {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary dark:text-blue-300" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "3 opções" — só as que quem preenche vê (lista ligada guarda também as que saíram dela). */
function optionCountText(field: DraftKanbanPhaseField): string {
  const count = visibleOptions(field.options, field.settingsJson, (o) => o.value).length;
  return `${count} opç${count === 1 ? 'ão' : 'ões'}${readItemListId(field.settingsJson) ? ' da lista' : ''}`;
}

function OptionsEditor({
  field,
  onChange,
  onLinkChange,
}: {
  field: DraftKanbanPhaseField;
  onChange: (options: DraftKanbanPhaseFieldOption[]) => void;
  /** Ligar/desligar a lista mexe nas opções e na configuração do campo juntas. */
  onLinkChange: (options: DraftKanbanPhaseFieldOption[], settingsJson: Record<string, unknown>) => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const options = field.options;
  const noun = field.fieldType === 'product_table' ? 'produto' : 'opção';

  function rename(index: number, label: string) {
    const next = [...options];
    const current = next[index];
    if (current.isNew) {
      const taken = new Set(options.filter((_, i) => i !== index).map((option) => option.value));
      next[index] = { ...current, label, value: optionValueFor(label, taken) };
    } else {
      next[index] = { ...current, label };
    }
    onChange(next);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function add(labels: string[]) {
    const taken = new Set(options.map((option) => option.value));
    const added = labels.map((label) => {
      const value = optionValueFor(label, taken);
      taken.add(value);
      return { value, label, isNew: true };
    });
    onChange([...options, ...added]);
  }

  const settings = field.settingsJson ?? {};
  const isListField = LIST_FIELD_TYPES.includes(field.fieldType);
  const manual = (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={smallLabelCls}>{field.fieldType === 'product_table' ? 'Produtos' : 'Opções'}</span>
        <button
          type="button"
          onClick={() => setPasting((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
        >
          <ClipboardPaste className="h-3 w-3" />
          Colar lista
        </button>
      </div>

      {pasting ? (
        <div className="grid gap-1.5 rounded-[8px] border border-dashed border-border-strong p-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder={'Uma por linha, por exemplo:\nCliente desistiu\nErro de digitação'}
            aria-label="Colar opções, uma por linha"
            className="w-full resize-none rounded-[6px] border border-border-default bg-bg-surface px-2 py-1.5 text-sm text-tx-primary outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPasting(false);
                setPasted('');
              }}
              className="h-8 rounded-[6px] px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const labels = pasted.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                if (labels.length) add(labels);
                setPasting(false);
                setPasted('');
              }}
              className="h-8 rounded-[6px] bg-primary px-3 text-xs font-bold text-white"
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : null}

      {options.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-3 text-center text-xs text-tx-muted">
          Nenhuma {noun} ainda.
        </p>
      ) : (
        <ol className="grid gap-1.5">
          {options.map((option, index) => (
            // Chave pela posição: o valor de uma opção nova muda enquanto o nome é digitado.
            <li key={index} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right text-[11px] font-semibold text-tx-muted">{index + 1}.</span>
              <div className="min-w-0 flex-1">
                <input
                  value={option.label}
                  onChange={(e) => rename(index, e.target.value)}
                  placeholder={`Nome da ${noun}`}
                  aria-label={`Nome da ${noun} ${index + 1}`}
                  className={cn(inputCls, 'h-8')}
                />
              </div>
              <code
                className="hidden w-[130px] shrink-0 truncate text-[10px] text-tx-muted sm:block"
                title="Valor gravado e comparado nas condições dos fluxos"
              >
                {option.value}
              </code>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Subir ${noun} ${index + 1}`}
                className="grid h-8 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === options.length - 1}
                aria-label={`Descer ${noun} ${index + 1}`}
                className="grid h-8 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(options.filter((_, i) => i !== index))}
                aria-label={`Remover ${noun} ${index + 1}`}
                className="grid h-8 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={() => add([''])}
        className="inline-flex w-fit items-center gap-1 text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
      >
        <Plus className="h-3 w-3" />
        Adicionar {noun}
      </button>
      {options.some((option) => !option.isNew) ? (
        <p className="text-[11px] text-tx-muted">
          O valor à direita é o que fica gravado e o que as condições dos fluxos comparam. Renomear a
          opção não muda o valor, para não quebrar respostas e fluxos existentes.
        </p>
      ) : null}
    </div>
  );
  if (!isListField) return manual;
  return (
    <ItemListSource
      listId={readItemListId(settings)}
      visibleLabels={visibleOptions(options, settings, (o) => o.value).map((o) => o.label)}
      hiddenCount={readHiddenOptionValues(settings).size}
      onLink={(list) => {
        // Só as opções já salvas (podem ter respostas) ficam, escondidas; as novas somem.
        const synced = linkOptions(
          options.filter((o) => !o.isNew).map(({ value, label }) => ({ value, label })),
          list,
        );
        onLinkChange(synced.options, linkSettings(settings, list.id, synced.hidden));
      }}
      onUnlink={() =>
        onLinkChange(
          visibleOptions(options, settings, (o) => o.value),
          linkSettings(settings, null),
        )
      }
    >
      {manual}
    </ItemListSource>
  );
}

function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function NumberSetting({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  min?: number;
}) {
  return (
    <label className="grid gap-1">
      <span className={smallLabelCls}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(numberOrUndefined(e.target.value))}
        className={inputCls}
      />
    </label>
  );
}

/** Ajustes que o card realmente respeita, por tipo (mesmos do formulário). */
function TypeSettings({
  field,
  formulaFields,
  onChange,
}: {
  field: DraftKanbanPhaseField;
  formulaFields: FormulaAvailableField[];
  onChange: (settings: FieldSettings) => void;
}) {
  const s = field.settingsJson;
  const set = (patch: Partial<FieldSettings>) => onChange({ ...s, ...patch });

  if (field.fieldType === 'calculated') {
    return (
      <div className="grid gap-2">
        <FormulaEditor
          fieldCode={field.code}
          settings={s}
          availableFields={formulaFields.filter((item) => item.code !== field.code)}
          onChangeSettings={(next) => onChange(withPhaseCalculatedFormat(next))}
          fixedFormat
        />
        <p className="text-[11px] leading-snug text-tx-muted">
          {isPhaseHoursSettings(s) ? 'O resultado sai em horas (ex.: 8h30)' : 'O resultado sai sempre em R$ com 2 casas'} e é
          recalculado ao salvar os campos do card — usa as respostas do formulário e os campos já
          preenchidos em qualquer fase.
        </p>
      </div>
    );
  }

  if (field.fieldType === 'item_order') {
    return <ItemOrderSettingsEditor settings={s} onChange={onChange} />;
  }

  if (field.fieldType === 'email' && s.userSuggestions) {
    return <UserEmailSettingsEditor settings={s} onChange={onChange} />;
  }

  if (field.fieldType === 'number') {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        <NumberSetting label="Mínimo" value={s.min} onChange={(min) => set({ min })} />
        <NumberSetting label="Máximo" value={s.max} onChange={(max) => set({ max })} />
        <NumberSetting label="Casas decimais" min={0} value={s.decimals} onChange={(decimals) => set({ decimals })} />
      </div>
    );
  }
  if (field.fieldType === 'short_text') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberSetting label="Mín. de caracteres" min={0} value={s.minLength} onChange={(minLength) => set({ minLength })} />
        <NumberSetting label="Máx. de caracteres" min={1} value={s.maxLength} onChange={(maxLength) => set({ maxLength })} />
      </div>
    );
  }
  if (field.fieldType === 'long_text') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberSetting label="Máx. de caracteres" min={1} value={s.maxLength} onChange={(maxLength) => set({ maxLength })} />
      </div>
    );
  }
  if (field.fieldType === 'scale' || field.fieldType === 'rating') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberSetting
          label={field.fieldType === 'rating' ? 'Número de estrelas' : 'Nota máxima'}
          min={2}
          value={s.max}
          onChange={(max) => set({ max })}
        />
      </div>
    );
  }
  if (field.fieldType === 'file_upload') {
    return (
      <div className="grid gap-1">
        <Switch
          checked={s.requireFileLabel !== false}
          onChange={(requireFileLabel) => set({ requireFileLabel })}
          label="Exigir nome ou descrição no arquivo"
        />
        <Switch
          checked={s.validateLabelWithAi ?? false}
          onChange={(validateLabelWithAi) => set({ validateLabelWithAi })}
          label="Validar etiqueta com IA (lote/fabricação/validade)"
        />
        {s.validateLabelWithAi ? (
          <p className="pl-11 text-[11px] leading-snug text-tx-muted">
            Para conferir contra valores digitados, crie campos de texto nesta fase com os códigos{' '}
            <code>lote</code>, <code>fabricacao</code> e <code>validade</code>.
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

/**
 * Um campo de fase na aba "Campos": fechado mostra só o essencial (tipo, nome, obrigatório); aberto
 * edita tudo. Campo novo deriva o código do nome; campo salvo mantém o código, porque fluxos e valores
 * já gravados dependem dele.
 */
export function PhaseFieldRow({
  field,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onMove,
  formulaFields = [],
}: {
  field: DraftKanbanPhaseField;
  /** Campos que um "Cálculo" pode usar: os do formulário e os das fases (o próprio fica de fora). */
  formulaFields?: FormulaAvailableField[];
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: DraftKanbanPhaseField) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const [choosingType, setChoosingType] = useState(!field.serverId && !field.label);
  const typeDef = phaseFieldTypeDef(field.fieldType, field.settingsJson);
  const typeChoice = fieldTypeChoiceOf(field.fieldType, field.settingsJson);
  const Icon = typeDef.icon;
  const isLayout = isPhaseLayoutType(field.fieldType);
  const displayName = field.label.trim() || (field.fieldType === 'divider' ? 'Divisor' : 'Campo sem nome');

  function changeType(choice: FieldTypeChoice) {
    setChoosingType(false);
    if (choice === typeChoice) return;
    const next = applyPhaseTypeChoice(choice, field.settingsJson);
    onChange({
      ...field,
      fieldType: next.fieldType,
      settingsJson: next.settingsJson,
      required: isPhaseLayoutType(next.fieldType) ? false : field.required,
    });
  }

  return (
    <li
      className={cn(
        'rounded-[10px] border bg-bg-surface transition-colors',
        expanded ? 'border-primary/60 shadow-sm' : 'border-border-default',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Recolher' : 'Editar'} campo ${displayName}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-bg-s2 text-tx-secondary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-tx-primary">
              {displayName}
              {field.required ? <span className="text-error"> *</span> : null}
            </span>
            <span className="block truncate text-[11px] text-tx-muted">
              {typeDef.label}
              {!isLayout && field.code ? ` · {{${field.code}}}` : ''}
              {phaseTypeHasOptions(field.fieldType) ? ` · ${optionCountText(field)}` : ''}
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-tx-muted transition-transform', expanded && 'rotate-180')}
          />
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Subir campo ${displayName}`}
            className="grid h-8 w-7 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Descer campo ${displayName}`}
            className="grid h-8 w-7 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover campo ${displayName}`}
            className="grid h-8 w-8 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-4 border-t border-border-default px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
            <label className="grid gap-1">
              <span className={smallLabelCls}>
                {field.fieldType === 'description' ? 'Texto exibido' : isLayout ? 'Texto do título' : 'Nome do campo'}
              </span>
              <input
                autoFocus={!field.serverId}
                value={field.label}
                onChange={(e) => {
                  const label = e.target.value;
                  onChange({ ...field, label, code: field.serverId ? field.code : slugify(label) });
                }}
                placeholder={field.fieldType === 'divider' ? 'Opcional' : 'Ex.: Retirado de rota'}
                aria-label="Nome do campo"
                className={inputCls}
              />
            </label>
            <div className="grid gap-1">
              <span className={smallLabelCls}>Tipo</span>
              <button
                type="button"
                onClick={() => setChoosingType((v) => !v)}
                aria-expanded={choosingType}
                className="flex h-9 min-w-0 items-center gap-2 rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-left text-sm text-tx-primary hover:border-primary/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-tx-secondary" />
                <span className="min-w-0 flex-1 truncate">{typeDef.label}</span>
                <span className="shrink-0 text-[11px] font-bold text-primary dark:text-blue-300">Trocar</span>
              </button>
            </div>
          </div>

          {!isPhaseFieldTypeAvailable(field.fieldType) ? (
            <p role="alert" className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Este tipo não funciona em campos de fase. Escolha outro.
            </p>
          ) : null}

          {choosingType ? (
            <PhaseFieldTypePicker value={typeChoice} onPick={changeType} onClose={() => setChoosingType(false)} />
          ) : null}

          {!isLayout ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {field.fieldType === 'calculated' ? (
                <span className="text-xs font-semibold text-tx-secondary">Calculado — ninguém preenche</span>
              ) : (
                <Switch
                  checked={field.required}
                  onChange={(required) => onChange({ ...field, required })}
                  label={field.fieldType === 'checkbox' ? 'Obrigatório (precisa estar marcado)' : 'Obrigatório'}
                />
              )}
              {field.code ? (
                <code className="truncate text-[11px] text-tx-muted" title="Código usado nos fluxos: variável e condição">
                  {`{{${field.code}}}`}
                </code>
              ) : null}
            </div>
          ) : null}

          {phaseTypeHasOptions(field.fieldType) ? (
            <OptionsEditor
              field={field}
              onChange={(options) => onChange({ ...field, options })}
              onLinkChange={(options, settingsJson) => onChange({ ...field, options, settingsJson })}
            />
          ) : null}

          <TypeSettings
            field={field}
            formulaFields={formulaFields}
            onChange={(settingsJson) => onChange({ ...field, settingsJson })}
          />
        </div>
      ) : null}
    </li>
  );
}
