import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../../app/auth-context';
import { api } from '../../../services/api';
import { fetchGoogleLoginUrl } from '../services/google-workspace-api';

export function useLoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const googleError = searchParams.get('googleError');
    if (!googleError) {
      return;
    }

    setError(googleError);
    const next = new URLSearchParams(searchParams);
    next.delete('googleError');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate('/inicio');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setError('Credenciais inválidas. Confira e-mail e senha.');
          return;
        }

        if (!error.response) {
          setError(`Não foi possível conectar na API (${api.defaults.baseURL}).`);
          return;
        }
      }

      setError('Não foi possível autenticar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleLogin() {
    setGoogleLoading(true);
    setError(null);

    try {
      const url = await fetchGoogleLoginUrl();
      window.location.assign(url);
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        setError(`Não foi possível conectar na API (${api.defaults.baseURL}).`);
      } else {
        setError('Não foi possível iniciar o login com Google Workspace.');
      }
      setGoogleLoading(false);
    }
  }

  return {
    email,
    password,
    error,
    loading,
    googleLoading,
    setEmail,
    setPassword,
    onSubmit,
    onGoogleLogin,
  };
}
