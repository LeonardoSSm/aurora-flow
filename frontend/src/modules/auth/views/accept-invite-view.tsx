import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, FieldLabel, TextInput, useToast } from '../../../components/ui';
import { PasswordStrengthBar } from '../../../components/ui/password-strength';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { setAccessToken } from '../../../services/api';
import { clearExperienceMode } from '../../experience-mode/experience-mode-store';
import { AuthShell } from '../components/auth-shell';
import { PASSWORD_HINT, PASSWORD_RULE } from '../hooks/use-set-password-form';
import {
  acceptUserInvite,
  fetchUserInvite,
  inviteErrorMessage,
  isInvalidInviteError,
  type UserInviteView,
} from '../services/user-invite-api';

/** A URL carrega uma credencial: pede aos buscadores para não indexar e ao navegador para não enviar Referer. */
function useSealedPage(): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Convite de acesso';
    const metas = [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ].map(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      return meta;
    });
    return () => {
      document.title = previousTitle;
      metas.forEach((meta) => meta.remove());
    };
  }, []);
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; invite: UserInviteView };

const cardCls = 'w-full p-8 md:p-10 !shadow-[0_24px_60px_rgba(9,22,54,0.32)]';

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function AcceptInviteView() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  useSealedPage();

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ok', invite: await fetchUserInvite(token) });
    } catch (error) {
      setState(
        isInvalidInviteError(error)
          ? { kind: 'invalid' }
          : { kind: 'error', message: inviteErrorMessage(error, 'Não foi possível abrir o convite.') },
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== 'ok') return;
    setFormError(null);

    if (!PASSWORD_RULE.test(password)) {
      setFormError(PASSWORD_HINT);
      return;
    }
    if (password !== confirmPassword) {
      setFormError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await acceptUserInvite(token, password);
      setAccessToken(session.accessToken);
      clearExperienceMode();
      queryClient.setQueryData(queryKeys.auth.me(), session);
      showToast({
        title: 'Senha criada',
        description: `Bem-vindo(a)! Nas próximas vezes, entre com ${state.invite.email} e essa senha.`,
        variant: 'success',
      });
      navigate('/inicio', { replace: true });
    } catch (error) {
      if (isInvalidInviteError(error)) {
        setState({ kind: 'invalid' });
      } else {
        setFormError(inviteErrorMessage(error, 'Não foi possível criar a senha. Tente novamente.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <section className="w-full max-w-[460px]">
        <Card className={cardCls}>
          {state.kind === 'loading' ? (
            <p className="text-center text-sm text-tx-secondary" role="status">
              Abrindo o convite...
            </p>
          ) : state.kind === 'invalid' ? (
            <div className="grid gap-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Convite inválido ou expirado</h2>
              <p className="text-sm text-tx-secondary">
                Este link já foi usado, foi substituído por um convite mais novo ou passou da validade.
                Peça um novo convite a quem administra o sistema.
              </p>
              <p className="text-sm text-tx-secondary">
                Se você já criou sua senha, é só entrar normalmente.
              </p>
              <Link
                to="/login"
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Ir para o login
              </Link>
            </div>
          ) : state.kind === 'error' ? (
            <div className="grid gap-4">
              <h2 className="text-2xl font-extrabold tracking-tight">Algo deu errado</h2>
              <p className="text-sm text-tx-secondary">{state.message}</p>
              <Button onClick={() => void load()}>Tentar de novo</Button>
            </div>
          ) : (
            <div className="grid gap-5">
              <header className="space-y-1">
                <h2 className="text-3xl font-extrabold tracking-tight">
                  Olá, {firstName(state.invite.fullName)}!
                </h2>
                <p>Crie sua senha para entrar no sistema.</p>
              </header>

              <form onSubmit={onSubmit} className="grid gap-5">
                <FieldLabel>
                  E-mail
                  <TextInput type="email" value={state.invite.email} readOnly disabled autoComplete="username" />
                </FieldLabel>

                <FieldLabel>
                  Senha
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <PasswordStrengthBar password={password} />
                  <span className="text-[11px] text-tx-secondary">{PASSWORD_HINT}</span>
                </FieldLabel>

                <FieldLabel>
                  Confirmar senha
                  <TextInput
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </FieldLabel>

                {formError ? <p className="text-sm font-semibold text-error">{formError}</p> : null}

                <Button type="submit" fullWidth disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar senha e entrar'}
                </Button>
              </form>

              <p className="text-center text-sm text-tx-secondary">
                Conta Google corporativa?{' '}
                <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                  Entre com o Google
                </Link>
              </p>
            </div>
          )}
        </Card>
      </section>
    </AuthShell>
  );
}
