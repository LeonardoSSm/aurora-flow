import { useParams } from 'react-router-dom';
import { SimpleKanbanToolbar } from '../modules/experience-mode/components/simple-kanban-toolbar';
import { useExperienceMode } from '../modules/experience-mode/experience-mode-store';
import { KanbanView } from '../modules/solicitations/views/kanban-view';

export function KanbanBoardPage() {
  const { formId } = useParams<{ formId: string }>();
  // Modo simplificado: Etapas e Automações do processo ficam no topo do kanban.
  const simple = useExperienceMode() === 'simple' && formId && formId !== 'unassigned';
  return <KanbanView headerActions={simple ? <SimpleKanbanToolbar formId={formId} /> : undefined} />;
}
