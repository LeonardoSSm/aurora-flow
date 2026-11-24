/**
 * Renderização segura de modelos de notificação.
 *
 * Sintaxe: `{{nome}}` ou `{{objeto.campo}}` — letras, dígitos e `_`, com pontos para caminhos.
 * Não há expressões, filtros, condicionais nem avaliação de código: é só substituição de texto.
 *
 * Garantias:
 * - **Passada única**: o valor inserido nunca é reinterpretado (um nome contendo `{{x}}` sai
 *   literal) — ao contrário da cadeia de `replace` do `interpolate` legado do motor.
 * - **Só lê variáveis próprias** do mapa recebido (`hasOwnProperty`), então `{{__proto__}}` e
 *   `{{constructor}}` são tratados como inexistentes.
 * - **Saída em texto puro**: nada aqui produz HTML. Quem precisar de HTML (e-mail) escapa a
 *   saída depois, no adapter.
 * - Remove caracteres de controle e de direção bidirecional (spoofing de texto).
 */

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

export type TemplateVariableValue = string | number | boolean | null | undefined;
export type TemplateVariables = Readonly<Record<string, TemplateVariableValue>>;

export interface RenderOptions {
  /** Limite de caracteres da saída; excedente vira `…`. */
  maxLength?: number;
}

export interface RenderResult {
  text: string;
  /** Variáveis que o modelo usou e existiam no mapa. */
  usedVariables: string[];
  /** Variáveis usadas no modelo mas inexistentes no mapa (renderizadas como vazio). */
  missingVariables: string[];
  truncated: boolean;
}

// Controle C0 (exceto \t \n), DEL, C1, espaço de largura zero, marcas e sobreposições de direção
// (spoofing) e BOM. ZWJ/ZWNJ (U+200C/D) ficam: emojis compostos dependem deles.
const UNSAFE_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁦-⁩﻿]/g;

/** Normaliza quebras de linha e remove caracteres de controle/direção. */
export function sanitizeText(input: string): string {
  return input.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS_RE, '');
}

/** Nomes (únicos, em ordem) das variáveis `{{...}}` bem formadas do modelo. */
export function extractTemplateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of (template ?? '').matchAll(TOKEN_RE)) names.add(match[1]);
  return [...names];
}

/**
 * `true` se todas as ocorrências de `{{` pertencem a uma variável bem formada —
 * pega `{{ nome`, `{{nome}`, `{{ a b }}`, `{{ 1x }}` etc. no momento de salvar o nó.
 */
export function hasMalformedTokens(template: string): boolean {
  const text = template ?? '';
  const opens = (text.match(/\{\{/g) ?? []).length;
  const wellFormed = (text.match(TOKEN_RE) ?? []).length;
  return opens !== wellFormed;
}

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  options: RenderOptions = {},
): RenderResult {
  const used = new Set<string>();
  const missing = new Set<string>();

  const replaced = sanitizeText(template ?? '').replace(TOKEN_RE, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      missing.add(name);
      return '';
    }
    used.add(name);
    const value = variables[name];
    return value === null || value === undefined ? '' : sanitizeText(String(value));
  });

  const text = replaced.trim();
  const max = options.maxLength;
  if (max !== undefined && text.length > max) {
    return {
      text: `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`,
      usedVariables: [...used],
      missingVariables: [...missing],
      truncated: true,
    };
  }
  return {
    text,
    usedVariables: [...used],
    missingVariables: [...missing],
    truncated: false,
  };
}

/** Escapa texto para inserção em HTML (corpo de e-mail). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remove quebras de linha de um valor de cabeçalho/assunto (anti header-injection). */
export function toSingleLine(text: string): string {
  return sanitizeText(text).replace(/\s*\n+\s*/g, ' ').trim();
}
