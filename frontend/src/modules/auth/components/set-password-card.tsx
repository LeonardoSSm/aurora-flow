import type { FormEvent } from 'react';
import { Button, Card, FieldLabel, TextInput } from '../../../components/ui';
import { PasswordStrengthBar } from '../../../components/ui/password-strength';
import { PASSWORD_HINT } from '../hooks/use-set-password-form';

type SetPasswordCardProps = {
  email: string;
  isChange: boolean;
  currentPassword: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  error: string | null;
  onCurrentPasswordChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSkip: () => void;
};

export function SetPasswordCard({
  email,
  isChange,
  currentPassword,
  password,
  confirmPassword,
  loading,
  error,
  onCurrentPasswordChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onSkip,
}: SetPasswordCardProps) {
  return (
    // O fundo agora e a arte do AuthShell: a secao vira so largura, e o cartao
    // ganha sombra forte porque flutua sobre o navy, nao sobre uma superficie clara.
    <section className="w-full max-w-[460px]">
      <Card className="w-full p-8 md:p-10 !shadow-[0_24px_60px_rgba(9,22,54,0.32)]">
        <div className="grid gap-5">
          <header className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight">
              {isChange ? 'Alterar senha' : 'Crie sua senha de acesso'}
            </h2>
            <p>
              {isChange
                ? 'Defina uma nova senha para o acesso com e-mail e senha.'
                : 'Você entrou com o Google Workspace. Cadastre uma senha para também poder entrar direto com e-mail e senha.'}
            </p>
          </header>

          <form onSubmit={onSubmit} className="grid gap-5">
            <FieldLabel>
              E-mail
              <TextInput type="email" value={email} readOnly disabled />
            </FieldLabel>

            {isChange ? (
              <FieldLabel>
                Senha atual
                <TextInput
                  type="password"
                  value={currentPassword}
                  onChange={(event) => onCurrentPasswordChange(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FieldLabel>
            ) : null}

            <FieldLabel>
              Nova senha
              <TextInput
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="new-password"
                required
              />
              <PasswordStrengthBar password={password} />
              <span className="text-[11px] text-tx-secondary">{PASSWORD_HINT}</span>
            </FieldLabel>

            <FieldLabel>
              Confirmar nova senha
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(event) => onConfirmPasswordChange(event.target.value)}
                autoComplete="new-password"
                required
              />
            </FieldLabel>

            {error ? <p className="text-sm font-semibold text-error">{error}</p> : null}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar senha e continuar'}
            </Button>
          </form>

          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-semibold text-tx-secondary underline-offset-4 hover:underline"
          >
            {isChange ? 'Cancelar' : 'Agora não, continuar sem senha'}
          </button>
        </div>
      </Card>
    </section>
  );
}
