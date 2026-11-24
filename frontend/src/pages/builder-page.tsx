import { BuilderView } from '../modules/builder/views/builder-view';
import { useExperienceMode } from '../modules/experience-mode/experience-mode-store';
import { SimpleProcessWizard } from '../modules/experience-mode/views/simple-process-wizard';

export function BuilderPage() {
  // Modo simplificado: o mesmo Criador, como passo a passo.
  return useExperienceMode() === 'simple' ? <SimpleProcessWizard /> : <BuilderView />;
}
