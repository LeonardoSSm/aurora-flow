import type { SubmissionItemEntity } from '../../../database/entities';
import { SOLICITATION_FORM_FIELD_VALUES_KEY } from '../types/flow.types';

/** Resposta do formulário ou valor de campo de fase: as duas tabelas têm as mesmas colunas. */
type AnswerItem = Pick<
  SubmissionItemEntity,
  'fieldCode' | 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'
>;

/** `{{cliente_codigo}}`: o código escolhido num campo "Lista do ERP" (`{{cliente}}` é o nome). */
export const ERP_LOOKUP_CODE_SUFFIX = '_codigo';

/**
 * Valores das respostas por código de campo, como os fluxos enxergam: `ctx.fields`, `{{campo}}`
 * e as condições. Campo "Lista do ERP" ganha também `<campo>_codigo` com o código no ERP — é o
 * que se manda de volta para o ERP; o `{{campo}}` mostra o nome que o usuário escolheu.
 *
 * `base` entra primeiro e é sobrescrito pelas respostas (é o que o motor faz ao recompor o
 * contexto de uma execução).
 */
export function buildFlowFieldValues(
  items: readonly AnswerItem[] | null | undefined,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...base };
  const answered = items ?? [];

  for (const item of answered) {
    fields[item.fieldCode] =
      item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
  }

  // Depois de todos os campos: um campo de verdade chamado "<campo>_codigo" nunca é sobrescrito.
  const realCodes = new Set(answered.map((item) => item.fieldCode));
  for (const item of answered) {
    const code = erpLookupCode(item.valueJson);
    const key = `${item.fieldCode}${ERP_LOOKUP_CODE_SUFFIX}`;
    if (code !== null && !realCodes.has(key)) {
      fields[key] = code;
    }
  }

  return fields;
}

/**
 * Valores dos campos de fase do Kanban já salvos numa solicitação (`kanban_phase_field_values`),
 * por código, com a mesma precedência das respostas. Quem junta isso a `ctx.fields` é
 * FlowsService.withPhaseFieldValues — a resposta do formulário ganha num código repetido.
 */
export function buildPhaseFieldValues(
  items: readonly AnswerItem[] | null | undefined,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const item of items ?? []) {
    fields[item.fieldCode] =
      item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
  }
  return fields;
}

/**
 * Respostas que um fluxo deu ao criar a solicitação (action_create_solicitation_from_payload,
 * `fieldValues`), gravadas em `solicitation.metadata[SOLICITATION_FORM_FIELD_VALUES_KEY]`. É o
 * equivalente das respostas do formulário para uma solicitação que nasceu sem envio. Só textos
 * não vazios — o resto da metadata é livre e não é confiável aqui.
 */
export function readSolicitationFormFieldValues(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const raw = metadata?.[SOLICITATION_FORM_FIELD_VALUES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const values: Record<string, string> = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) values[code] = value;
  }
  return values;
}

/** Formato gravado no envio de um campo "Lista do ERP" (ver ErpLookupFieldService). */
function erpLookupCode(valueJson: unknown): string | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const { value, label, fonte } = valueJson as Record<string, unknown>;
  return typeof value === 'string' && typeof label === 'string' && typeof fonte === 'string'
    ? value
    : null;
}
