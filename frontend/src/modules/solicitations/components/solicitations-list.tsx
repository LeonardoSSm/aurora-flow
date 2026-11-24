import { Card } from '../../../components/ui';
import type { Solicitation } from '../types';
import {
  getOriginLabel,
  getPriorityClass,
  getPriorityMeta,
  getStatusClass,
  getStatusMeta,
} from './solicitation-formatters';

type SolicitationsListProps = {
  solicitations: Solicitation[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
};

export function SolicitationsList({
  solicitations,
  selectedId,
  loading,
  onSelect,
}: SolicitationsListProps) {
  if (loading && solicitations.length === 0) {
    return (
      <Card className="grid min-w-0 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-3">
            <div className="mb-2 h-4 w-3/4 rounded bg-surface-container-high" />
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-surface-container-high" />
              <div className="h-5 w-12 rounded-full bg-surface-container-high" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  if (solicitations.length === 0) {
    return (
      <Card>
        <p className="text-sm text-tx-secondary">Nenhuma solicitação encontrada.</p>
      </Card>
    );
  }

  return (
    <Card className="grid min-w-0 gap-2">
      {solicitations.map((solicitation) => {
        const selected = solicitation.id === selectedId;

        return (
          <button
            key={solicitation.id}
            type="button"
            onClick={() => onSelect(solicitation.id)}
            className={[
              'grid w-full min-w-0 gap-2 rounded-xl border px-3 py-3 text-left transition-colors',
              selected
                ? 'border-primary bg-primary/10'
                : 'border-border-default/50 bg-surface-container-low hover:bg-surface-container-high',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <strong className="min-w-0 flex-1 truncate text-sm text-tx-primary">
                {solicitation.title}
              </strong>
              <span className="text-xs font-semibold text-tx-secondary">
                {getOriginLabel(solicitation.originType)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={[
                  'inline-flex rounded-full px-2 py-1 text-xs font-bold',
                  getStatusClass(solicitation.status),
                ].join(' ')}
              >
                {getStatusMeta(solicitation.status).label}
              </span>
              <span
                className={[
                  'inline-flex rounded-full px-2 py-1 text-xs font-bold',
                  getPriorityClass(solicitation.priority),
                ].join(' ')}
              >
                {getPriorityMeta(solicitation.priority).label}
              </span>
            </div>

            <small className="text-xs text-tx-secondary">
              Atualizada em {new Date(solicitation.updatedAt).toLocaleString('pt-BR')}
            </small>
          </button>
        );
      })}
    </Card>
  );
}
