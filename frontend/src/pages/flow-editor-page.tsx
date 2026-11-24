import { useParams } from 'react-router-dom';
import { FlowEditorView } from '../modules/flows/views/flow-editor-view';

export function FlowEditorPage() {
  const { id } = useParams();
  return <FlowEditorView flowId={id ?? null} />;
}
