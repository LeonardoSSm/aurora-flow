import { Calculator, Download, FileDown, Paperclip } from 'lucide-react';
import { useRef, useState } from 'react';
import { IMaskInput } from 'react-imask';
import { CameraCaptureButton } from '../../../components/camera-capture-button';
import { PendingUploadList } from '../../../components/pending-upload-list';
import { fileLabelRequired, prepareUploads, type PendingUpload } from '../../../lib/attachment-upload';
import { formatCalculatedValue } from '../../forms/formula';
import { downloadFileUrl, formatDownloadSize } from '../../forms/download-file';
import type { DownloadFileSettings, ProductTableColumn as ProductTableColumnT } from '../../forms/types';
import {
  getFieldPlaceholder,
  getProductTableColumns,
  getRatingMax,
  isHiddenFromRespondent,
} from '../form-runtime';
import { ChoiceDropdown } from './choice-dropdown';
import { ErpLookupField } from './erp-lookup-field';
import { ErpTableField } from './erp-table-field';
import { ItemOrderField } from './item-order-field';
import { UserEmailField } from './user-email-field';
import type { PublicAnswerValue, PublicFormField, ProductTableCellValue, ProductTableRow } from '../types';
import { markFieldInvalid } from '../field-a11y';

type PublicQuestionFieldProps = {
  field: PublicFormField;
  value: PublicAnswerValue;
  /** Formulário publicado: a "Lista do ERP" precisa dele para pesquisar. Sem ele, só pré-visualiza. */
  formId?: string;
  /** Respostas por código: a "Tabela dinâmica do ERP" lê delas os campos de que depende. */
  answersByCode?: Record<string, PublicAnswerValue>;
  error?: string;
  pendingFiles?: PendingUpload[];
  onChange: (value: PublicAnswerValue) => void;
  onToggleMulti: (optionValue: string, checked: boolean) => void;
  /** Arquivos novos (já otimizados), somados aos que o campo já tem. */
  onAddFiles?: (uploads: PendingUpload[]) => void;
  onUpdateFile?: (uploadId: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => void;
  onRemoveFile?: (index: number) => void;
};

// ── Shared geometry/colors — driven by the --tf-* vars set at the page root
// (public-form-view.tsx / builder-wizard-preview.tsx) from brand.colors.*. ──

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 36,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  fontSize: 13,
  color: 'var(--tf-text)',
  background: 'var(--tf-background)',
};

function FileUploadField({
  field,
  pendingFiles = [],
  showErrors,
  onAddFiles,
  onUpdateFile,
  onRemoveFile,
}: {
  field: PublicFormField;
  pendingFiles: PendingUpload[];
  showErrors: boolean;
  onAddFiles?: (uploads: PendingUpload[]) => void;
  onUpdateFile?: (uploadId: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => void;
  onRemoveFile?: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState('');

  // Sem limite de quantidade nem de tamanho (só o teto técnico do servidor).
  const allowedMimes = field.settingsJson.allowedMimeTypes ?? [];
  const acceptAttr = allowedMimes.join(',') || undefined;
  // A câmera sempre gera JPEG: só faz sentido oferecer quando o campo aceita imagem.
  const acceptsCameraPhoto =
    allowedMimes.length === 0 || allowedMimes.some((mime) => mime === 'image/jpeg' || mime === 'image/*');
  // PNG sem transparência só vira JPEG se o campo aceitar JPEG.
  const allowJpeg = allowedMimes.length === 0 || allowedMimes.includes('image/jpeg');
  const requireLabel = fileLabelRequired(field.settingsJson);

  async function addFiles(rawFiles: FileList | File[] | null) {
    if (!rawFiles || !onAddFiles) return;
    const incoming = Array.from(rawFiles);
    if (incoming.length === 0) return;
    // O seletor já filtra pelo accept; arrastar e soltar não passa por ele.
    const accepted = incoming.filter((file) => allowedMimes.length === 0 || allowedMimes.includes(file.type));
    setNotice(
      accepted.length < incoming.length
        ? 'Tipo de arquivo não aceito neste campo. Os demais foram adicionados.'
        : '',
    );
    if (accepted.length === 0) return;
    setPreparing(true);
    try {
      onAddFiles(await prepareUploads(accepted, { allowJpeg }));
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
        className="cursor-pointer text-center transition-colors"
        style={{
          padding: 22,
          borderRadius: 14,
          border: `2px dashed ${dragging ? 'var(--tf-primary)' : '#C7D2E8'}`,
          background: 'var(--tf-background)',
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <Paperclip className="h-5 w-5" style={{ color: 'var(--tf-text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--tf-text)' }}>
            {preparing ? 'Preparando arquivos…' : 'Arraste arquivos ou clique para selecionar'}
          </span>
          <span className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
            {requireLabel
              ? 'Pode enviar vários. Dê um nome novo ou uma descrição a cada um.'
              : 'Pode enviar vários arquivos.'}
          </span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttr}
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          // Permite escolher de novo o mesmo arquivo depois de removê-lo.
          e.target.value = '';
        }}
      />

      {acceptsCameraPhoto ? (
        <CameraCaptureButton
          onCapture={(file) => { void addFiles([file]); }}
          disabled={!onAddFiles || preparing}
          className="flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: '1.5px solid var(--tf-border)',
            background: 'var(--tf-surface)',
            color: 'var(--tf-text)',
          }}
        />
      ) : null}

      {notice ? (
        <span role="alert" className="text-xs font-semibold" style={{ color: 'var(--tf-danger)' }}>
          {notice}
        </span>
      ) : null}

      <PendingUploadList
        variant="public"
        uploads={pendingFiles}
        requireLabel={requireLabel}
        showErrors={showErrors}
        onChange={(id, patch) => onUpdateFile?.(id, patch)}
        onRemove={(index) => onRemoveFile?.(index)}
      />
    </div>
  );
}

const productTableCellStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '0 10px',
  fontSize: 13,
};

/** Largura mínima (px) por tipo de coluna — número pede bem menos espaço que texto livre.
 * É só um piso: quem decide a largura de verdade é o peso proporcional abaixo, essa aqui
 * só evita que a coluna fique espremida demais num container muito estreito (aí a rolagem
 * horizontal do container pai assume). */
function getProductTableColumnMinWidth(column: ProductTableColumnT): number {
  return column.type === 'number' ? 84 : 140;
}

/** Peso da coluna "Produto" na divisão proporcional da largura da tabela (ver
 * getProductTableColumnWidths). Maior que o peso de uma coluna de texto (1) porque nome de
 * produto tende a ser a maior célula da linha, mas não ilimitado — sem esse teto, a coluna
 * de nome sozinha herdava 100% do espaço que sobrava da tabela (table-layout auto sem width
 * definido), empurrando as colunas de valor pra uma faixa minúscula e fixa lá no canto. */
const PRODUCT_NAME_COLUMN_WEIGHT = 1.5;
const PRODUCT_NAME_COLUMN_MIN_WIDTH = 140;

function getProductTableColumnWeight(column: ProductTableColumnT): number {
  return column.type === 'number' ? 0.6 : 1;
}

/** Larguras (%) de cada coluna — proporcionais ao peso de cada uma, para uso num
 * `<colgroup>` com `table-layout: fixed`. Com isso a coluna de produto continua ganhando
 * mais espaço que uma coluna de valor (é o esperado — nome de produto é texto livre mais
 * longo), mas de forma proporcional e não "tudo que sobrar", deixando as colunas de valor
 * com espaço de verdade pra digitar em vez de uma faixa fixa apertada no canto direito. */
function getProductTableColumnWidths(columns: ProductTableColumnT[]): {
  produto: number;
  columns: number[];
} {
  const columnWeights = columns.map(getProductTableColumnWeight);
  const totalWeight = PRODUCT_NAME_COLUMN_WEIGHT + columnWeights.reduce((sum, w) => sum + w, 0);
  return {
    produto: (PRODUCT_NAME_COLUMN_WEIGHT / totalWeight) * 100,
    columns: columnWeights.map((weight) => (weight / totalWeight) * 100),
  };
}

/** Respiro horizontal das células: `pr-2` no produto, `px-2` nas demais. */
const PRODUCT_NAME_CELL_PADDING = 8;
const PRODUCT_TABLE_CELL_PADDING = 16;

/** Menor largura (px) da tabela em que toda coluna, com a sua fatia proporcional, ainda
 * respeita o próprio piso. Abaixo disso, a tabela rola dentro do container. */
function getProductTableMinWidth(columns: ProductTableColumnT[]): number {
  const widths = getProductTableColumnWidths(columns);
  const needed = [
    (PRODUCT_NAME_COLUMN_MIN_WIDTH + PRODUCT_NAME_CELL_PADDING) / (widths.produto / 100),
    ...columns.map(
      (column, index) =>
        (getProductTableColumnMinWidth(column) + PRODUCT_TABLE_CELL_PADDING) /
        (widths.columns[index] / 100),
    ),
  ];
  return Math.ceil(Math.max(...needed));
}

/**
 * Lista de produtos fixa (definida pelo criador nas opções do campo), com colunas
 * também configuráveis pelo criador (padrão: só "Quantidade"). Quem responde só
 * preenche os valores de cada coluna, o nome do produto nunca é editável.
 */
function ProductTableField({
  field,
  value,
  onChange,
}: {
  field: PublicFormField;
  value: PublicAnswerValue;
  onChange: (value: PublicAnswerValue) => void;
}) {
  const columns = getProductTableColumns(field.settingsJson);
  const columnWidths = getProductTableColumnWidths(columns);
  const submitted = Array.isArray(value) ? (value as ProductTableRow[]) : [];
  const valuesByProduct = new Map(submitted.map((row) => [row.produto, row.values ?? {}]));

  function updateCell(productLabel: string, columnLabel: string, cellValue: ProductTableCellValue) {
    const rows: ProductTableRow[] = field.options.map((option) => {
      const current = valuesByProduct.get(option.displayLabel) ?? {};
      if (option.displayLabel !== productLabel) {
        return { produto: option.displayLabel, values: current };
      }
      const nextValues = { ...current };
      if (cellValue === null || cellValue === '') {
        delete nextValues[columnLabel];
      } else {
        nextValues[columnLabel] = cellValue;
      }
      return { produto: option.displayLabel, values: nextValues };
    });
    onChange(rows);
  }

  function renderCellInput(option: PublicFormField['options'][number], column: ProductTableColumnT) {
    if (column.filledBy === 'creator') {
      const preset = field.settingsJson.productTableProductValues?.[option.internalValue]?.[column.id];
      return (
        <span
          className="block truncate text-sm"
          style={{ ...productTableCellStyle, lineHeight: '34px', background: 'var(--tf-surface)' }}
        >
          {preset ?? '—'}
        </span>
      );
    }
    const rowValues = valuesByProduct.get(option.displayLabel) ?? {};
    return (
      <input
        type={column.type === 'number' ? 'number' : 'text'}
        min={column.type === 'number' ? 0 : undefined}
        placeholder={column.type === 'number' ? '0' : ''}
        value={rowValues[column.label] ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (column.type === 'number') {
            updateCell(option.displayLabel, column.label, raw === '' ? null : Number(raw));
          } else {
            updateCell(option.displayLabel, column.label, raw);
          }
        }}
        className="w-full placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={productTableCellStyle}
      />
    );
  }

  if (field.options.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--tf-text-muted)' }}>
        Nenhum produto foi configurado para este campo.
      </p>
    );
  }

  return (
    <div>
      {/* Telas estreitas: um cartão por produto — a tabela não cabe sem cortar
          coluna ou forçar rolagem horizontal dentro do card do formulário. */}
      <div className="grid gap-3 sm:hidden">
        {field.options.map((option) => (
          <div
            key={option.id}
            className="grid gap-2.5"
            style={{ border: '1.5px solid var(--tf-border)', borderRadius: 12, padding: '12px 14px' }}
          >
            <span className="text-sm font-bold" style={{ color: 'var(--tf-text)' }}>
              {option.displayLabel}
            </span>
            {columns.map((column) => (
              <label key={column.id} className="grid gap-1">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: 'var(--tf-text-muted)' }}
                >
                  {column.label}
                </span>
                {renderCellInput(option, column)}
              </label>
            ))}
          </div>
        ))}
      </div>

      {/* Telas médias e maiores: tabela de verdade, colunas largas o suficiente para
          caber sem rolagem no card do formulário. Com `table-layout: fixed` o `minWidth` das
          células não vale; o piso fica na tabela, e o formulário estreito (420 px, ficha do ERP
          aberta ao lado) rola na horizontal em vez de encavalar os cabeçalhos. */}
      <div className="hidden overflow-x-auto sm:block">
        <table
          className="border-separate"
          style={{
            borderSpacing: '0 8px',
            width: '100%',
            minWidth: getProductTableMinWidth(columns),
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: `${columnWidths.produto}%` }} />
            {columns.map((column, index) => (
              <col key={column.id} style={{ width: `${columnWidths.columns[index]}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                className="text-left text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--tf-text-muted)', minWidth: PRODUCT_NAME_COLUMN_MIN_WIDTH }}
              >
                Produto
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="px-2 text-left text-xs font-bold uppercase tracking-wide"
                  style={{
                    color: 'var(--tf-text-muted)',
                    minWidth: getProductTableColumnMinWidth(column),
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {field.options.map((option) => (
              <tr key={option.id}>
                <td className="pr-2" style={{ minWidth: PRODUCT_NAME_COLUMN_MIN_WIDTH }}>
                  <span
                    className="block truncate text-sm font-medium"
                    title={option.displayLabel}
                    style={{ color: 'var(--tf-text)' }}
                  >
                    {option.displayLabel}
                  </span>
                </td>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className="px-2 py-0.5"
                    style={{ minWidth: getProductTableColumnMinWidth(column) }}
                  >
                    {renderCellInput(option, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Resultado de um campo de fórmula: sempre somente leitura, recalculado a cada resposta. */
function CalculatedField({ field, value }: { field: PublicFormField; value: PublicAnswerValue }) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const formatted = formatCalculatedValue(numericValue, field.settingsJson);

  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        ...inputStyle,
        background: 'var(--tf-primary-light)',
        borderStyle: 'dashed',
        fontWeight: 700,
        fontSize: 16,
      }}
    >
      <Calculator className="h-4 w-4 shrink-0" style={{ color: 'var(--tf-primary)' }} />
      <span
        aria-live="polite"
        style={{ color: formatted ? 'var(--tf-primary)' : 'var(--tf-text-muted)' }}
      >
        {formatted || 'Aguardando os campos do cálculo'}
      </span>
    </div>
  );
}

function resolveInputType(fieldType: PublicFormField['fieldType']) {
  if (fieldType === 'email') return 'email';
  if (fieldType === 'number') return 'number';
  if (fieldType === 'date') return 'date';
  if (fieldType === 'time') return 'time';
  if (fieldType === 'datetime') return 'datetime-local';
  return 'text';
}

// Masked types handled by IMask
const MASKED_TYPES: PublicFormField['fieldType'][] = ['cpf', 'cnpj', 'phone', 'cep', 'currency'];

function renderMaskedInput(
  field: PublicFormField,
  value: PublicAnswerValue,
  onChange: (value: PublicAnswerValue) => void,
) {
  if (field.fieldType === 'cpf') {
    return (
      <IMaskInput
        mask="000.000.000-00"
        value={typeof value === 'string' ? value : ''}
        onAccept={(v) => onChange(String(v))}
        placeholder={getFieldPlaceholder(field.fieldType)}
        className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={inputStyle}
      />
    );
  }

  if (field.fieldType === 'cnpj') {
    return (
      <IMaskInput
        mask="00.000.000/0000-00"
        value={typeof value === 'string' ? value : ''}
        onAccept={(v) => onChange(String(v))}
        placeholder={getFieldPlaceholder(field.fieldType)}
        className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={inputStyle}
      />
    );
  }

  if (field.fieldType === 'phone') {
    return (
      <IMaskInput
        mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
        value={typeof value === 'string' ? value : ''}
        onAccept={(v) => onChange(String(v))}
        placeholder={getFieldPlaceholder(field.fieldType)}
        className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={inputStyle}
      />
    );
  }

  if (field.fieldType === 'cep') {
    return (
      <IMaskInput
        mask="00000-000"
        value={typeof value === 'string' ? value : ''}
        onAccept={(v) => onChange(String(v))}
        placeholder={getFieldPlaceholder(field.fieldType)}
        className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={inputStyle}
      />
    );
  }

  // currency — Number mask with Brazilian locale, stores "R$ 1.500,00"
  if (field.fieldType === 'currency') {
    const raw = typeof value === 'string' ? value.replace(/^R\$\s?/, '') : '';
    return (
      <div className="relative flex items-center">
        <span
          className="pointer-events-none absolute left-3.5 select-none text-sm"
          style={{ color: 'var(--tf-text-muted)' }}
        >
          R$
        </span>
        <IMaskInput
          mask={Number}
          scale={2}
          thousandsSeparator="."
          radix=","
          mapToRadix={['.']}
          normalizeZeros
          padFractionalZeros
          value={raw}
          onAccept={(v) => onChange(v ? `R$ ${String(v)}` : '')}
          placeholder={getFieldPlaceholder(field.fieldType)}
          className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>
    );
  }

  return null;
}

/**
 * "Arquivo para baixar": o rótulo explica o que fazer (ex.: "Baixe o termo, assine e anexe
 * abaixo") e o botão baixa o arquivo que o construtor enviou. Sem arquivo só acontece na prévia de
 * um rascunho — publicar exige o arquivo.
 */
function DownloadFileCard({ label, file }: { label: string; file?: DownloadFileSettings }) {
  const size = file ? formatDownloadSize(file.size) : '';
  return (
    <div
      className="grid gap-3 rounded-xl p-4 sm:flex sm:items-center"
      style={{ border: '1px solid var(--tf-border)', background: 'var(--tf-surface)' }}
    >
      <span
        aria-hidden
        className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg sm:grid"
        style={{ background: 'var(--tf-primary-light)', color: 'var(--tf-primary)' }}
      >
        <FileDown className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        {label ? (
          <p className="font-semibold" style={{ fontSize: 13, color: 'var(--tf-text)' }}>
            {label}
          </p>
        ) : null}
        <p className="truncate text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          {file ? [file.name, size].filter(Boolean).join(' · ') : 'Arquivo ainda não enviado.'}
        </p>
      </div>
      {file ? (
        <a
          href={downloadFileUrl(file)}
          download={file.name}
          rel="noopener"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white"
          style={{ background: 'var(--tf-primary)' }}
        >
          <Download className="h-4 w-4" />
          Baixar arquivo
        </a>
      ) : null}
    </div>
  );
}

export function PublicQuestionField({
  field,
  value,
  formId,
  answersByCode,
  error,
  pendingFiles,
  onChange,
  onToggleMulti,
  onAddFiles,
  onUpdateFile,
  onRemoveFile,
}: PublicQuestionFieldProps) {
  // Cálculo que não aparece para quem responde (a prévia do construtor e o teste de fluxo também
  // desenham por aqui, então mostram o que o respondente vai ver).
  if (isHiddenFromRespondent(field)) return null;

  if (field.fieldType === 'divider') {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--tf-border)' }} />;
  }

  if (field.fieldType === 'title') {
    return (
      <h3 className="text-xl font-bold" style={{ color: 'var(--tf-text)' }}>
        {field.label}
      </h3>
    );
  }

  if (field.fieldType === 'description') {
    return (
      <p className="text-sm" style={{ color: 'var(--tf-text-muted)' }}>
        {field.label}
      </p>
    );
  }

  if (field.fieldType === 'file_download') {
    return <DownloadFileCard label={field.label} file={field.settingsJson.downloadFile} />;
  }

  const hasMask = MASKED_TYPES.includes(field.fieldType);
  // "E-mail de usuário": e-mail com sugestões de usuários do sistema.
  const isUserEmail = field.fieldType === 'email' && !!field.settingsJson.userSuggestions;
  const ratingMax = getRatingMax(field.settingsJson);

  // Native text-like inputs (includes datetime-local for datetime type)
  const nativeTextTypes: PublicFormField['fieldType'][] = [
    'short_text',
    'email',
    'date',
    'time',
    'datetime',
    'number',
  ];

  return (
    <div
      className="grid gap-1.5"
      data-field-invalid={error ? 'true' : undefined}
      ref={(node) => markFieldInvalid(node, Boolean(error))}
    >
      <label className="block font-semibold" style={{ fontSize: 13, color: 'var(--tf-text)' }}>
        {field.label}
        {field.required ? <span style={{ color: 'var(--tf-danger)' }}> *</span> : null}
      </label>

      {field.fieldType === 'calculated' ? (
        <CalculatedField field={field} value={value} />
      ) : null}

      {hasMask ? renderMaskedInput(field, value, onChange) : null}

      {isUserEmail ? (
        <UserEmailField
          field={field}
          value={value}
          formId={formId}
          invalid={!!error}
          onChange={onChange}
          inputStyle={inputStyle}
        />
      ) : null}

      {!hasMask && !isUserEmail && nativeTextTypes.includes(field.fieldType) ? (
        <input
          type={resolveInputType(field.fieldType)}
          min={field.fieldType === 'number' ? field.settingsJson.min : undefined}
          max={field.fieldType === 'number' ? field.settingsJson.max : undefined}
          step={
            field.fieldType === 'number'
              ? field.settingsJson.decimals === 0
                ? '1'
                : 'any'
              : undefined
          }
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          placeholder={getFieldPlaceholder(field.fieldType)}
          className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
          style={inputStyle}
          onChange={(event) => {
            if (field.fieldType === 'number') {
              const next = event.target.value.trim();
              if (!next) {
                onChange(null);
                return;
              }
              const parsed = Number(next);
              onChange(Number.isFinite(parsed) ? parsed : null);
              return;
            }
            onChange(event.target.value);
          }}
        />
      ) : null}

      {field.fieldType === 'long_text' ? (
        <textarea
          rows={3}
          maxLength={field.settingsJson.maxLength}
          className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
          style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="Escreva sua resposta"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {(field.fieldType === 'single_select' || field.fieldType === 'multi_select') &&
      field.settingsJson.displayAs === 'dropdown' ? (
        <ChoiceDropdown
          options={field.options}
          multiple={field.fieldType === 'multi_select'}
          value={Array.isArray(value) || typeof value === 'string' ? (value as string | string[]) : null}
          invalid={Boolean(error)}
          onChange={(next) => onChange(next)}
        />
      ) : null}

      {field.fieldType === 'single_select' && field.settingsJson.displayAs !== 'dropdown' ? (
        <div className="grid gap-2.5">
          {field.options.map((option) => {
            const selected = value === option.internalValue;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.internalValue)}
                className="flex w-full items-center gap-3 text-left transition-colors"
                style={{
                  padding: '13px 16px',
                  borderRadius: 12,
                  border: `1.5px solid ${selected ? 'var(--tf-primary)' : 'var(--tf-border)'}`,
                  background: selected ? 'var(--tf-primary-light)' : 'var(--tf-surface)',
                  fontSize: 14,
                  fontWeight: selected ? 700 : 500,
                  color: 'var(--tf-text)',
                }}
              >
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: 18,
                    height: 18,
                    border: `2px solid ${selected ? 'var(--tf-primary)' : '#C7D2E8'}`,
                    background: selected ? 'var(--tf-primary)' : 'transparent',
                    boxShadow: selected ? 'inset 0 0 0 3px var(--tf-surface)' : 'none',
                  }}
                />
                <span>{option.displayLabel}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {field.fieldType === 'multi_select' && field.settingsJson.displayAs !== 'dropdown' ? (
        <div className="grid gap-2.5">
          {field.options.map((option) => {
            const selected = Array.isArray(value)
              ? (value as string[]).includes(option.internalValue)
              : false;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggleMulti(option.internalValue, !selected)}
                className="flex w-full items-center gap-3 text-left transition-colors"
                style={{
                  padding: '13px 16px',
                  borderRadius: 12,
                  border: `1.5px solid ${selected ? 'var(--tf-accent)' : 'var(--tf-border)'}`,
                  background: selected ? '#EAF3EA' : 'var(--tf-surface)',
                  fontSize: 14,
                  fontWeight: selected ? 700 : 500,
                  color: 'var(--tf-text)',
                }}
              >
                <span
                  className="flex shrink-0 items-center justify-center text-xs font-extrabold text-white"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    border: `2px solid ${selected ? 'var(--tf-accent)' : '#C7D2E8'}`,
                    background: selected ? 'var(--tf-accent)' : 'transparent',
                  }}
                >
                  {selected ? '✓' : ''}
                </span>
                <span>{option.displayLabel}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {field.fieldType === 'checkbox' ? (
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--tf-text)' }}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          Marcar como confirmado
        </label>
      ) : null}

      {['scale', 'rating'].includes(field.fieldType) ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            {Array.from({ length: ratingMax }, (_, index) => index + 1).map((score) => {
              const active = value === score;
              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => onChange(score)}
                  className="grid place-items-center rounded-full font-bold transition-colors"
                  style={{
                    width: 42,
                    height: 42,
                    border: `1.5px solid ${active ? 'var(--tf-primary)' : 'var(--tf-border)'}`,
                    background: active ? 'var(--tf-primary)' : 'var(--tf-surface)',
                    color: active ? '#fff' : 'var(--tf-text)',
                    fontSize: 14,
                  }}
                >
                  {score}
                </button>
              );
            })}
          </div>
          <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
            Selecione uma nota de 1 a {ratingMax}.
          </small>
        </div>
      ) : null}

      {field.fieldType === 'product_table' ? (
        <ProductTableField field={field} value={value} onChange={onChange} />
      ) : null}

      {field.fieldType === 'erp_lookup' ? (
        <ErpLookupField
          field={field}
          value={value}
          formId={formId}
          onChange={onChange}
          inputStyle={inputStyle}
        />
      ) : null}

      {field.fieldType === 'erp_table' ? (
        <ErpTableField
          field={field}
          value={value}
          formId={formId}
          answersByCode={answersByCode}
          showErrors={!!error}
          onChange={onChange}
        />
      ) : null}

      {field.fieldType === 'item_order' ? (
        <ItemOrderField
          field={field}
          value={value}
          formId={formId}
          showErrors={!!error}
          onChange={onChange}
        />
      ) : null}

      {field.fieldType === 'file_upload' ? (
        <FileUploadField
          field={field}
          pendingFiles={pendingFiles ?? []}
          showErrors={!!error}
          onAddFiles={onAddFiles}
          onUpdateFile={onUpdateFile}
          onRemoveFile={onRemoveFile}
        />
      ) : null}

      {error ? (
        <span
          // O campo de arquivo já anuncia o erro de cada arquivo; aqui não repete.
          role={field.fieldType === 'file_upload' ? undefined : 'alert'}
          className="text-xs font-semibold"
          style={{ color: 'var(--tf-danger)' }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
