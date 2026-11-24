/**
 * Configuração de um campo "Lista do ERP" (`settingsJson` do campo). Contrato documentado em
 * Docs/campo_lista_erp_plano.md (Fase 2.1).
 */
export type ErpLookupMode = 'lista' | 'pesquisa';

export interface ErpLookupSettings {
  erpConnectorId: string;
  fonte: string;
  modo: ErpLookupMode;
  minCaracteres: number;
  exigirLogin: boolean;
  placeholder: string | null;
}

/** A API erp-lookup recusa pesquisa com menos de 2 caracteres. */
export const MIN_CARACTERES_PESQUISA = 2;
const MAX_CARACTERES_MINIMO = 20;
const MIN_CARACTERES_PADRAO = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lê a configuração do campo aplicando os padrões. `null` quando falta o essencial (conector ou
 * lista) — campo ainda em montagem no construtor, ou configuração quebrada.
 */
export function parseErpLookupSettings(raw: unknown): ErpLookupSettings | null {
  const settings = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const erpConnectorId =
    typeof settings.erpConnectorId === 'string' ? settings.erpConnectorId.trim() : '';
  const fonte = typeof settings.fonte === 'string' ? settings.fonte.trim() : '';
  if (!UUID_RE.test(erpConnectorId) || !fonte) {
    return null;
  }

  const rawMin = settings.minCaracteres;
  const minCaracteres =
    typeof rawMin === 'number' && Number.isInteger(rawMin)
      ? Math.min(Math.max(rawMin, MIN_CARACTERES_PESQUISA), MAX_CARACTERES_MINIMO)
      : MIN_CARACTERES_PADRAO;

  const placeholder =
    typeof settings.placeholder === 'string' && settings.placeholder.trim()
      ? settings.placeholder.trim()
      : null;

  return {
    erpConnectorId,
    fonte,
    modo: settings.modo === 'lista' ? 'lista' : 'pesquisa',
    minCaracteres,
    // Decisão de 2026-10-07: começa desligado; ligar por campo em listas com dado sensível.
    exigirLogin: settings.exigirLogin === true,
    placeholder,
  };
}

/**
 * O que o formulário público recebe: o suficiente para desenhar o campo. Conector e lista ficam
 * no servidor — o navegador só pesquisa por formulário + campo.
 */
export function toPublicErpLookupSettings(raw: unknown): Record<string, unknown> {
  const settings = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parsed = parseErpLookupSettings(raw);
  const { erpConnectorId: _conector, fonte: _fonte, ...rest } = settings;
  return {
    ...rest,
    modo: parsed?.modo ?? 'pesquisa',
    minCaracteres: parsed?.minCaracteres ?? MIN_CARACTERES_PADRAO,
    exigirLogin: parsed?.exigirLogin ?? false,
    placeholder: parsed?.placeholder ?? null,
  };
}
