import { useNavigate } from 'react-router-dom';
import { FlowCanvas } from '../components/FlowCanvas';
import type { Flow } from '../types/flow.types';

type FlowEditorViewProps = {
  flowId: string | null;
};

export function FlowEditorView({ flowId }: FlowEditorViewProps) {
  const navigate = useNavigate();

  function handleCreated(flow: Flow) {
    navigate(`/flows/${flow.id}`, { replace: true });
  }

  function handleDeleted() {
    navigate('/flows', { replace: true });
  }

  return (
    <section className="-m-4 h-[calc(100vh-32px)] min-h-[640px] overflow-hidden bg-bg-s2 md:-m-6 md:h-screen">
      <FlowCanvas
        key={flowId ?? 'new-flow'}
        flowId={flowId}
        onCreated={handleCreated}
        onDeleted={handleDeleted}
      />
    </section>
  );
}
