import { Button, Card, FieldLabel, SelectInput, TextInput } from '../../../components/ui';
import type { SolicitationPriority, SolicitationStatus } from '../types';
import { priorityOptions, statusOptions } from './solicitation-formatters';

type SolicitationsToolbarProps = {
  query: string;
  statusFilter?: SolicitationStatus;
  priorityFilter?: SolicitationPriority;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: SolicitationStatus | '') => void;
  onPriorityChange: (value: SolicitationPriority | '') => void;
  onReload: () => void;
};

export function SolicitationsToolbar({
  query,
  statusFilter,
  priorityFilter,
  loading,
  onQueryChange,
  onStatusChange,
  onPriorityChange,
  onReload,
}: SolicitationsToolbarProps) {
  return (
    <Card className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto] lg:items-end">
        <FieldLabel>
          Buscar
          <TextInput
            value={query}
            placeholder="Titulo, descricao, respondente ou e-mail..."
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </FieldLabel>

        <FieldLabel>
          Status
          <SelectInput
            value={statusFilter ?? ''}
            onChange={(event) => onStatusChange(event.target.value as SolicitationStatus | '')}
          >
            <option value="">Todos</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>

        <FieldLabel>
          Prioridade
          <SelectInput
            value={priorityFilter ?? ''}
            onChange={(event) =>
              onPriorityChange(event.target.value as SolicitationPriority | '')
            }
          >
            <option value="">Todas</option>
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>

        <Button variant="subtle" onClick={onReload} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>
    </Card>
  );
}
