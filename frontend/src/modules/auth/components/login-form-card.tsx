import type { FormEvent } from 'react';
import { Button, Card, FieldLabel, TextInput } from '../../../components/ui';

type LoginFormCardProps = {
  email: string;
  password: string;
  loading: boolean;
  googleLoading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleLogin: () => void;
};

export function LoginFormCard({
  email,
  password,
  loading,
  googleLoading,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
}: LoginFormCardProps) {
  return (
    // O fundo agora e a arte do AuthShell: a secao vira so largura, e o cartao
    // ganha sombra forte porque flutua sobre o navy, nao sobre uma superficie clara.
    <section className="w-full max-w-[460px]">
      <Card className="w-full p-8 md:p-10 !shadow-[0_24px_60px_rgba(9,22,54,0.32)]">
        <div className="grid gap-5">
          <header className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight">Acesso Administrativo</h2>
            <p>Use o Google Workspace como acesso principal ou entre com credenciais locais.</p>
          </header>

          <Button fullWidth disabled={googleLoading} onClick={onGoogleLogin}>
            {googleLoading ? 'Redirecionando...' : 'Entrar com Google Workspace'}
          </Button>

          <div className="flex items-center gap-3 text-xs font-semibold uppercase text-tx-secondary">
            <span className="h-px flex-1 bg-outline-variant/40" />
            <span>ou com e-mail e senha</span>
            <span className="h-px flex-1 bg-outline-variant/40" />
          </div>

          <form onSubmit={onSubmit} className="grid gap-5">
            <FieldLabel>
              E-mail
              <TextInput
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="seu.nome@empresa.com.br"
                autoComplete="username"
                required
              />
            </FieldLabel>

            <FieldLabel>
              Senha
              <TextInput
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="current-password"
                required
              />
            </FieldLabel>

            {error ? <p className="text-sm font-semibold text-error">{error}</p> : null}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar com e-mail e senha'}
            </Button>
          </form>
        </div>
      </Card>
    </section>
  );
}
