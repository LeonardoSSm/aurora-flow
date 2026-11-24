import {
  AlignLeft,
  Calculator,
  AtSign,
  Building2,
  Calendar,
  CalendarClock,
  CheckSquare,
  CircleDot,
  Clock,
  DollarSign,
  Gauge,
  Hash,
  Heading,
  ListFilter,
  IdCard,
  ListChecks,
  MapPin,
  Minus,
  Paperclip,
  Phone,
  ShoppingCart,
  SquareChevronDown,
  Star,
  Table2,
  Text,
  Timer,
  Type,
  UserRoundSearch,
  type LucideIcon,
} from 'lucide-react';
import type { FieldSettings, FormFieldType } from '../../forms/types';
import { PHASE_CALCULATED_SETTINGS, withPhaseCalculatedFormat } from './phase-formula';
import {
  applyFieldTypeChoice,
  fieldTypeChoiceOf,
  getDefaultFieldSettings,
  type FieldTypeChoice,
} from '../../builder/types';

export type PhaseFieldTypeDef = {
  /** Tipo de verdade, ou "Lista suspensa" (a seleção com `displayAs: 'dropdown'`). */
  value: FieldTypeChoice;
  label: string;
  hint: string;
  icon: LucideIcon;
};

/**
 * Tipos que um campo de fase pode ter, agrupados como no seletor. Fica de fora o que não funciona
 * no card: "Lista/Tabela do ERP" (o backend recusa — só o formulário confere no ERP) e as
 * pontuações por seção (fase não tem seção). "Cálculo" de fase é em R$ (o "Total de horas", em 8h30) e quem grava o resultado é o backend, ao salvar os campos do card — como o
 * retrato do "Pedido de itens", montado com a lista atual.
 */
export const PHASE_FIELD_TYPE_GROUPS: ReadonlyArray<{ group: string; types: PhaseFieldTypeDef[] }> = [
  {
    group: 'Texto',
    types: [
      { value: 'short_text', label: 'Texto curto', hint: 'Uma linha', icon: Type },
      { value: 'long_text', label: 'Texto longo', hint: 'Observações, várias linhas', icon: AlignLeft },
      { value: 'email', label: 'E-mail', hint: 'Confere o formato', icon: AtSign },
      { value: 'user_email', label: 'E-mail de usuário', hint: 'Sugere usuários do sistema', icon: UserRoundSearch },
      { value: 'phone', label: 'Telefone', hint: 'Com DDD', icon: Phone },
      { value: 'cep', label: 'CEP', hint: '8 dígitos', icon: MapPin },
      { value: 'cpf', label: 'CPF', hint: 'Confere os dígitos', icon: IdCard },
      { value: 'cnpj', label: 'CNPJ', hint: 'Confere os dígitos', icon: Building2 },
    ],
  },
  {
    group: 'Números e datas',
    types: [
      { value: 'number', label: 'Número', hint: 'Quantidade, peso…', icon: Hash },
      { value: 'currency', label: 'Valor (R$)', hint: 'Dinheiro', icon: DollarSign },
      { value: 'calculated', label: 'Cálculo (R$)', hint: 'Fórmula com outros campos', icon: Calculator },
      { value: 'date', label: 'Data', hint: 'Dia/mês/ano', icon: Calendar },
      { value: 'time', label: 'Hora', hint: 'Horário', icon: Clock },
      { value: 'hours_total', label: 'Total de horas', hint: 'Entre duas Horas (8h30)', icon: Timer },
      { value: 'datetime', label: 'Data e hora', hint: 'Momento exato', icon: CalendarClock },
    ],
  },
  {
    group: 'Escolha',
    types: [
      { value: 'checkbox', label: 'Marcar (sim/não)', hint: 'Ex.: "Retirado de rota"', icon: CheckSquare },
      { value: 'single_select', label: 'Uma opção', hint: 'Escolhe uma da lista', icon: CircleDot },
      { value: 'multi_select', label: 'Várias opções', hint: 'Marca quantas quiser', icon: ListChecks },
      { value: 'dropdown_single', label: 'Lista suspensa', hint: 'Uma opção, com busca', icon: SquareChevronDown },
      { value: 'dropdown_multi', label: 'Lista suspensa (várias)', hint: 'Várias, com busca', icon: ListFilter },
      { value: 'scale', label: 'Escala', hint: 'De 1 até N', icon: Gauge },
      { value: 'rating', label: 'Avaliação', hint: 'Estrelas', icon: Star },
    ],
  },
  {
    group: 'Arquivos e tabelas',
    types: [
      { value: 'file_upload', label: 'Arquivo ou foto', hint: 'Anexo da fase', icon: Paperclip },
      { value: 'product_table', label: 'Tabela de produtos', hint: 'Uma linha por produto', icon: Table2 },
      { value: 'item_order', label: 'Pedido de itens', hint: 'Pesquisa na lista + quantidade', icon: ShoppingCart },
    ],
  },
  {
    group: 'Conteúdo (sem resposta)',
    types: [
      { value: 'title', label: 'Título', hint: 'Separa blocos', icon: Heading },
      { value: 'description', label: 'Texto explicativo', hint: 'Instruções', icon: Text },
      { value: 'divider', label: 'Divisor', hint: 'Linha', icon: Minus },
    ],
  },
];

const BY_VALUE = new Map(
  PHASE_FIELD_TYPE_GROUPS.flatMap((group) => group.types).map((type) => [type.value, type]),
);

/** Definição do tipo; tipo antigo fora do catálogo (ex.: "Cálculo" já salvo) ainda aparece. */
export function phaseFieldTypeDef(value: FormFieldType, settings?: FieldSettings | null): PhaseFieldTypeDef {
  return (
    BY_VALUE.get(fieldTypeChoiceOf(value, settings)) ??
    BY_VALUE.get(value) ?? { value, label: value, hint: 'Tipo não disponível em fases', icon: Type }
  );
}

export function isPhaseFieldTypeAvailable(value: FormFieldType): boolean {
  return BY_VALUE.has(value);
}

/** Só exibem conteúdo no card: não têm resposta, código útil nem obrigatoriedade. */
export const PHASE_LAYOUT_TYPES: ReadonlySet<FormFieldType> = new Set(['title', 'description', 'divider']);

export function isPhaseLayoutType(value: FormFieldType): boolean {
  return PHASE_LAYOUT_TYPES.has(value);
}

export function phaseTypeHasOptions(value: FormFieldType): boolean {
  return value === 'single_select' || value === 'multi_select' || value === 'product_table';
}

/**
 * Configuração ao trocar de tipo: começa dos padrões do tipo novo (escala com nota máxima, arquivo
 * com tipos…) e só leva o que faz sentido em qualquer tipo — a validação de etiqueta por IA e a
 * exigência de nome/descrição continuam se o campo seguir sendo de arquivo.
 */
export function settingsForType(next: FormFieldType, current: FieldSettings): FieldSettings {
  const base = getDefaultFieldSettings(next);
  if (next === 'calculated') return { ...base, ...PHASE_CALCULATED_SETTINGS };
  if (next !== 'file_upload') return base;
  return {
    ...base,
    ...(current.validateLabelWithAi ? { validateLabelWithAi: true } : {}),
    ...(current.requireFileLabel === false ? { requireFileLabel: false } : {}),
  };
}

/** Tipo e configuração ao escolher no seletor — "Lista suspensa" vira a seleção com displayAs. */
export function applyPhaseTypeChoice(
  choice: FieldTypeChoice,
  current: FieldSettings,
): { fieldType: FormFieldType; settingsJson: FieldSettings } {
  const { fieldType, settingsJson } = applyFieldTypeChoice(choice, current);
  // "Total de horas": cálculo novo, em horas — a fórmula sai do atalho de chegada e saída.
  if (settingsJson.formulaFormat === 'hours') {
    return { fieldType, settingsJson: withPhaseCalculatedFormat({ ...getDefaultFieldSettings(fieldType), formulaFormat: 'hours' }) };
  }
  const base = settingsForType(fieldType, current);
  return {
    fieldType,
    settingsJson: settingsJson.displayAs
      ? { ...base, displayAs: settingsJson.displayAs }
      : settingsJson.userSuggestions
        ? { ...base, userSuggestions: settingsJson.userSuggestions }
        : base,
  };
}
