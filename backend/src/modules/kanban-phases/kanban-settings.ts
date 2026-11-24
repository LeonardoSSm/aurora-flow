import type { FormKanbanSettings } from '../../database/entities/form.entity';

const FIELD_CODE = /^[a-zA-Z0-9_]{1,120}$/;

/** Configuração gravada do Kanban: campo de valor só com código válido; o resto vira o padrão. */
export function normalizeKanbanSettings(raw: unknown): FormKanbanSettings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const code = typeof input.cardValueField === 'string' ? input.cardValueField.trim() : '';
  return { cardValueField: FIELD_CODE.test(code) ? code : null };
}
