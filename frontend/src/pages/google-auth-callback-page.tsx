import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth-context';
import { clearExperienceMode } from '../modules/experience-mode/experience-mode-store';

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAuthHydrating } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (isAuthHydrating || hasNavigated.current) {
      return;
    }
    hasNavigated.current = true;

    if (!isAuthenticated) {
      navigate('/login?googleError=Não foi possível concluir o login com Google.', {
        replace: true,
      });
      return;
    }

    // Entrou agora: o AppShell volta a perguntar modo simplificado ou avançado.
    clearExperienceMode();

    // Conta criada pelo Google que ainda não tem senha local: pede o cadastro
    // antes de entrar, para que o usuário também consiga acessar por e-mail e senha.
    navigate(user?.hasPassword === false ? '/definir-senha' : '/inicio', { replace: true });
  }, [isAuthHydrating, isAuthenticated, user, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <p className="text-sm font-semibold text-tx-secondary">
        Finalizando login com Google Workspace...
      </p>
    </div>
  );
}
