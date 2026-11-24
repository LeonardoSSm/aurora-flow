import { useParams } from 'react-router-dom';
import { PublicFormView } from '../modules/public-form/views/public-form-view';

export function PublicFormPage() {
  const { formId } = useParams();
  return <PublicFormView formId={formId} />;
}
