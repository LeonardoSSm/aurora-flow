/** Espelha modules/records do backend. Chave de coluna: sys:<nome> | form:<code> | phase:<code>. */
export type RecordColumnGroup = 'system' | 'form' | 'phase';
export type RecordFilterKind = 'choice' | 'text' | 'boolean' | 'none';

export type RecordColumnOption = { value: string; label: string };

export type RecordColumn = {
  key: string;
  label: string;
  group: RecordColumnGroup;
  filter: RecordFilterKind;
  options?: RecordColumnOption[];
  masked?: boolean;
  phaseLabel?: string;
};

export type RecordsMeta = {
  formId: string;
  formName: string;
  columns: RecordColumn[];
  defaultColumns: string[];
  canExport: boolean;
  maxReportRows: number;
};

export type RecordRow = {
  id: string;
  submissionId: string | null;
  values: Record<string, string>;
};

export type RecordsPage = {
  data: RecordRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** Filtro numa coluna: opções marcadas (escolha, sim/não) ou trecho de texto. */
export type RecordFilter = { key: string; values?: string[]; text?: string };

export type DateField = 'createdAt' | 'updatedAt';

export type RecordFilters = {
  search?: string;
  dateField?: DateField;
  /** ISO, início do dia de "De" no fuso de quem usa. */
  from?: string;
  /** ISO, fim do dia de "Até". */
  to?: string;
  filters?: RecordFilter[];
};

export type SortableKey = 'sys:createdAt' | 'sys:updatedAt' | 'sys:phaseEnteredAt' | 'sys:title';

export type RecordsQuery = RecordFilters & {
  page: number;
  limit: number;
  sortBy?: SortableKey;
  sortDir?: 'asc' | 'desc';
};

export type RecordReportConfig = {
  title: string;
  subtitle: string;
  layout: 'table' | 'cards';
  orientation: 'portrait' | 'landscape';
  columns: Array<{ key: string; label?: string }>;
  groupBy: string | null;
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  showSummary: boolean;
  showFilters: boolean;
  fontSize: 'small' | 'normal';
};

export type ReportTemplate = {
  id: string;
  name: string;
  config: RecordReportConfig;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: string;
  canManage: boolean;
};
