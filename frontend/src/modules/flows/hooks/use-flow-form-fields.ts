import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import type { KanbanPhase } from '../../kanban-phases/types';

export type FlowFieldMeta = {
  code: string;
  label: string;
  fieldType: string;
  /** Nome da fase do Kanban quando o campo é preenchido no card, não no formulário. */
  phaseLabel?: string;
  /** Cálculo em horas ("Total de horas"): resultado em 8h30, não em R$. */
  formulaFormat?: 'hours';
};

function formulaFormatOf(settings: unknown): Pick<FlowFieldMeta, 'formulaFormat'> {
  const format = (settings as { formulaFormat?: unknown } | null | undefined)?.formulaFormat;
  return format === 'hours' ? { formulaFormat: 'hours' } : {};
}

const LAYOUT_TYPES = new Set(['title', 'description', 'divider', 'file_download']);

type FormFieldsResponse = { versions?: Array<{ sections?: Array<{ fields?: unknown[] }> }> };

/**
 * Campos que um fluxo enxerga (`ctx.fields`, `{{campo}}`, condições): os do formulário e, depois,
 * os das fases do Kanban — o backend junta os valores de fase salvos na solicitação
 * (FlowsService.withPhaseFieldValues). Num código repetido o do formulário ganha, como lá.
 */
export function useFlowFormFields(formId: string | null) {
  return useQuery({
    queryKey: ['panel-form-fields', formId ?? 'none'],
    queryFn: async (): Promise<FlowFieldMeta[]> => {
      const [form, phases] = await Promise.all([
        api.get<FormFieldsResponse>(`/forms/${formId}`).then((res) => res.data),
        api
          .get<KanbanPhase[]>(`/forms/${formId}/kanban-phases`)
          .then((res) => res.data)
          .catch(() => [] as KanbanPhase[]),
      ]);
      const sections = form?.versions?.[0]?.sections ?? [];
      const formFields = sections.flatMap((s) =>
        (s.fields ?? []).map((f) => {
          const field = f as Record<string, unknown>;
          return {
            code: String(field.code ?? ''),
            label: String(field.label || field.code || ''),
            fieldType: String(field.fieldType ?? ''),
            ...formulaFormatOf(field.settingsJson),
          };
        }),
      );
      const taken = new Set(formFields.map((field) => field.code));
      const phaseFields: FlowFieldMeta[] = [];
      for (const phase of Array.isArray(phases) ? phases : []) {
        for (const field of phase.fields) {
          // Título, descrição e divisor da fase só exibem texto: não têm valor para o fluxo.
          if (LAYOUT_TYPES.has(field.fieldType) || taken.has(field.code)) continue;
          taken.add(field.code);
          phaseFields.push({
            code: field.code,
            label: `${field.label || field.code} (fase ${phase.label})`,
            fieldType: field.fieldType,
            phaseLabel: phase.label,
            ...formulaFormatOf(field.settingsJson),
          });
        }
      }
      return [...formFields, ...phaseFields];
    },
    enabled: !!formId,
    staleTime: 60_000,
  });
}
