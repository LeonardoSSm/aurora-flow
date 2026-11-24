import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, X } from 'lucide-react';
import { Button, FieldLabel, SelectInput, TextInput, useToast } from '../../components/ui';
import { useAreasQuery } from '../admin/hooks/use-areas';
import { fetchForms } from '../forms/services/forms-api';
import { statusOptions } from '../solicitations/components/solicitation-formatters';
import type { SolicitationStatus } from '../solicitations/types';
import { downloadExecutiveReport, type ReportFilters } from './reports-api';

type Props = { onClose: () => void };

export function ExportReportModal({ onClose }: Props) {
  const { showToast } = useToast();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: areas = [] } = useAreasQuery();
  const { data: formsData } = useQuery({
    queryKey: ['forms', 'list', 'report-modal'],
    queryFn: () => fetchForms({ limit: 100 }),
  });
  const forms = formsData?.data ?? [];

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const blob = await downloadExecutiveReport(filters);
      const today = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-solicitacoes-${today}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: 'PDF baixado com sucesso', variant: 'success' });
      onClose();
    } catch {
      showToast({ title: 'Erro ao gerar relatório. Tente novamente.', variant: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="grid w-full max-w-md gap-5 rounded-2xl bg-surface p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-tx-primary">Exportar relatório</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-tx-secondary hover:bg-surface-container-low"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel>
              De
              <TextInput
                type="date"
                value={filters.startDate ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, startDate: e.target.value || undefined }))
                }
              />
            </FieldLabel>
            <FieldLabel>
              Até
              <TextInput
                type="date"
                value={filters.endDate ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, endDate: e.target.value || undefined }))
                }
              />
            </FieldLabel>
          </div>

          <FieldLabel>
            Área
            <SelectInput
              value={filters.areaId ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, areaId: e.target.value || undefined }))
              }
            >
              <option value="">Todas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </SelectInput>
          </FieldLabel>

          <FieldLabel>
            Status
            <SelectInput
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value as SolicitationStatus) || undefined,
                }))
              }
            >
              <option value="">Todos</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectInput>
          </FieldLabel>

          <FieldLabel>
            Formulário
            <SelectInput
              value={filters.formId ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, formId: e.target.value || undefined }))
              }
            >
              <option value="">Todos</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </SelectInput>
          </FieldLabel>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            <FileDown size={16} className="mr-2 inline" />
            {isGenerating ? 'Gerando PDF...' : 'Gerar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}
