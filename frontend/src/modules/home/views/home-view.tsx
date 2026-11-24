import { useAuth } from '../../../app/auth-context';
import { GreetingBanner } from '../components/greeting-banner';
import { ModuleGrid } from '../components/module-grid';

/**
 * Porta de entrada do Aurora Flow: atalhos para o motor de automações.
 */
export function HomeView() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-8">
      <GreetingBanner userFullName={user?.fullName ?? 'Usuário'} />
      <ModuleGrid />
    </div>
  );
}
