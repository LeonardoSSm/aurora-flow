import { Card } from '../../../components/ui';
import type { Solicitation } from '../types';

type SolicitationsSummaryProps = {
  solicitations: Solicitation[];
  total: number;
};

export function SolicitationsSummary({ solicitations, total }: SolicitationsSummaryProps) {
  const openCount = solicitations.filter((item) => item.status === 'open').length;
  const urgentCount = solicitations.filter((item) => item.priority === 'urgent').length;
  const fromFormsCount = solicitations.filter((item) => item.originType === 'form_submission').length;

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card className="grid gap-1">
        <span className="text-xs font-bold uppercase text-tx-secondary">Total</span>
        <strong className="text-2xl text-tx-primary">{total}</strong>
      </Card>
      <Card className="grid gap-1">
        <span className="text-xs font-bold uppercase text-tx-secondary">Abertas</span>
        <strong className="text-2xl text-tx-primary">{openCount}</strong>
      </Card>
      <Card className="grid gap-1">
        <span className="text-xs font-bold uppercase text-tx-secondary">Urgentes</span>
        <strong className="text-2xl text-tx-primary">{urgentCount}</strong>
      </Card>
      <Card className="grid gap-1">
        <span className="text-xs font-bold uppercase text-tx-secondary">De formularios</span>
        <strong className="text-2xl text-tx-primary">{fromFormsCount}</strong>
      </Card>
    </div>
  );
}
