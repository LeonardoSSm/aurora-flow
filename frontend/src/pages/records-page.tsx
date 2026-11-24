import { Navigate, useLocation, useParams } from 'react-router-dom';
import { RecordsView } from '../modules/records/views/records-view';

export function RecordsPage() {
  return <RecordsView />;
}

/** Respostas virou Registros: links antigos (inclusive dos e-mails já enviados) seguem abrindo, com o `?solicitacao=`. */
export function LegacyResponsesRedirect() {
  const { formId } = useParams<{ formId: string }>();
  const { search } = useLocation();
  return <Navigate to={formId ? `/registros/${formId}${search}` : '/formularios'} replace />;
}
