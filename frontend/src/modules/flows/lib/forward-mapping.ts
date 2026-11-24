/**
 * "Encaminhar para outro processo": o que o painel mostra sobre cada campo do destino — se vai pelo
 * mesmo código, e se o tipo da origem cabe nele. Espelha a conversão do backend
 * (solicitations/process-handoff.answers.ts); quem decide de verdade é o servidor, na execução.
 */

export type ForwardMapping = { targetFieldCode: string; sourceFieldCode?: string; value?: string };

type FieldLike = { code: string; label: string; fieldType: string; phaseLabel?: string };

/** Não recebem resposta (só exibem texto ou são calculados no destino). Arquivo vai como anexo. */
const NOT_MAPPABLE = new Set(['title', 'description', 'divider', 'file_download', 'calculated', 'file_upload']);

/** Retrato montado no envio: só passa de um campo do mesmo tipo. */
const SAME_TYPE_ONLY = new Set(['erp_lookup', 'erp_table', 'item_order', 'product_table']);

/** Não têm texto para um campo de outro tipo. */
const NO_TEXT = new Set(['erp_table', 'item_order', 'product_table', 'file_upload']);

const FREE_TEXT = new Set(['short_text', 'long_text']);

const NUMERIC = new Set(['number', 'scale', 'rating', 'currency', 'calculated']);

/** Campos do formulário de destino que podem receber valor (os de fase do destino ficam de fora). */
export function forwardTargetFields<T extends FieldLike>(fields: readonly T[]): T[] {
  return fields.filter((field) => !field.phaseLabel && !NOT_MAPPABLE.has(field.fieldType));
}

/** Campos do card atual que podem dar valor: formulário e fases. */
export function forwardSourceFields<T extends FieldLike>(fields: readonly T[]): T[] {
  return fields.filter((field) => !['title', 'description', 'divider', 'file_download'].includes(field.fieldType));
}

/**
 * 'ok' = mesmo tipo (ou conversão segura); 'convert' = converte, mas pode não caber em algum card
 * (ex.: texto num campo de número); 'incompatible' = nunca vai.
 */
export function forwardCompatibility(
  sourceType: string | null,
  targetType: string,
): 'ok' | 'convert' | 'incompatible' {
  if (SAME_TYPE_ONLY.has(targetType) && sourceType !== targetType) return 'incompatible';
  // Texto (ou valor sem tipo, de um template) sempre cabe num campo de texto livre.
  if (sourceType === null) return FREE_TEXT.has(targetType) ? 'ok' : 'convert';
  if (sourceType === targetType) return 'ok';
  if (NO_TEXT.has(sourceType)) return 'incompatible';
  if (FREE_TEXT.has(targetType)) return 'ok';
  if (NUMERIC.has(targetType) && NUMERIC.has(sourceType)) return 'ok';
  if (['single_select', 'multi_select'].includes(targetType) && ['single_select', 'multi_select'].includes(sourceType)) {
    return 'convert';
  }
  return 'convert';
}

/** Campos do destino que vão sozinhos pelo mesmo código (os mapeados à mão não contam). */
export function autoMatchedFields<T extends FieldLike>(
  targets: readonly T[],
  sources: readonly FieldLike[],
  mappings: readonly ForwardMapping[],
): Array<{ target: T; compatibility: ReturnType<typeof forwardCompatibility> }> {
  const mapped = new Set(mappings.map((mapping) => mapping.targetFieldCode));
  const sourceByCode = new Map(sources.map((source) => [source.code, source]));
  return targets.flatMap((target) => {
    const source = sourceByCode.get(target.code);
    if (!source || mapped.has(target.code)) return [];
    return [{ target, compatibility: forwardCompatibility(source.fieldType, target.fieldType) }];
  });
}
