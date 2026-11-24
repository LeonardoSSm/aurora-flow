/**
 * Rótulo dos campos de escolha nos textos dos fluxos. A resposta de uma seleção é gravada pelo
 * valor interno (`cliente_desistiu`); e-mail e WhatsApp precisam do que a pessoa viu
 * ("Cliente desistiu"). As condições continuam comparando `ctx.fields`, que fica com o valor.
 *
 * `{{campo}}` → rótulo; `{{campo_valor}}` → valor interno (para mandar a outro sistema). É o
 * mesmo par da "Lista do ERP": `{{cliente}}` (nome) e `{{cliente_codigo}}`.
 */

export const CHOICE_VALUE_SUFFIX = '_valor';

/** código do campo → (valor interno → rótulo). */
export type ChoiceOptionsByCode = Map<string, Map<string, string>>;

function labelOf(options: Map<string, string>, value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return options.get(String(value)) ?? null;
  }
  return null;
}

/** Rótulos das respostas de escolha presentes em `fields` (só os que têm opção conhecida). */
export function buildFieldLabels(
  fields: Record<string, unknown> | undefined,
  options: ChoiceOptionsByCode,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [code, value] of Object.entries(fields ?? {})) {
    const fieldOptions = options.get(code);
    if (!fieldOptions || value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const parts = value.map((entry) => labelOf(fieldOptions, entry));
      if (parts.some((part) => part !== null)) {
        labels[code] = value.map((entry, i) => parts[i] ?? String(entry)).join(', ');
      }
      continue;
    }
    const label = labelOf(fieldOptions, value);
    if (label !== null) labels[code] = label;
  }
  return labels;
}

/** O que um `{{código}}` vira no texto: rótulo, valor do campo, `_valor` de escolha ou metadado. */
export function fieldTemplateValue(
  ctx: {
    fields?: Record<string, unknown>;
    fieldLabels?: Record<string, string>;
    metadata?: Record<string, unknown>;
  },
  code: string,
): unknown {
  const direct = ctx.fieldLabels?.[code] ?? ctx.fields?.[code];
  if (direct !== null && direct !== undefined) return direct;
  if (code.endsWith(CHOICE_VALUE_SUFFIX)) {
    const base = code.slice(0, -CHOICE_VALUE_SUFFIX.length);
    if (ctx.fieldLabels?.[base] !== undefined) return ctx.fields?.[base];
  }
  return ctx.metadata?.[code];
}
