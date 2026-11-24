import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { useSetPasswordMutation } from '../queries/auth.queries';

// Mesma regra validada pelo backend em SetPasswordDto.
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PASSWORD_HINT = 'Mínimo de 8 caracteres, com 1 maiúscula, 1 minúscula e 1 número.';

function getSetPasswordErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    if (!error.response) return 'Não foi possível conectar na API.';
  }
  return 'Não foi possível salvar a senha. Tente novamente.';
}

export function useSetPasswordForm() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const setPasswordMutation = useSetPasswordMutation();

  // Quem já tem senha cadastrada precisa confirmar a atual para trocá-la.
  const isChange = Boolean(user?.hasPassword);

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isChange && !currentPassword) {
      setError('Informe a senha atual.');
      return;
    }

    if (!PASSWORD_RULE.test(password)) {
      setError(PASSWORD_HINT);
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    try {
      await setPasswordMutation.mutateAsync({
        password,
        ...(isChange ? { currentPassword } : {}),
      });

      showToast({
        title: isChange ? 'Senha alterada' : 'Senha cadastrada',
        description: `Agora você pode entrar com ${user?.email ?? 'seu e-mail'} e a senha criada.`,
        variant: 'success',
      });
      navigate('/inicio', { replace: true });
    } catch (error) {
      setError(getSetPasswordErrorMessage(error));
    }
  }

  function onSkip() {
    navigate('/inicio', { replace: true });
  }

  return {
    email: user?.email ?? '',
    isChange,
    currentPassword,
    password,
    confirmPassword,
    error,
    loading: setPasswordMutation.isPending,
    setCurrentPassword,
    setPassword,
    setConfirmPassword,
    onSubmit,
    onSkip,
  };
}
