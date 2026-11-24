import { AuthShell } from '../components/auth-shell';
import { LoginFormCard } from '../components/login-form-card';
import { useLoginForm } from '../hooks/use-login-form';

export function LoginView() {
  const {
    email,
    password,
    error,
    loading,
    googleLoading,
    setEmail,
    setPassword,
    onSubmit,
    onGoogleLogin,
  } = useLoginForm();

  return (
    <AuthShell>
      <LoginFormCard
        email={email}
        password={password}
        loading={loading}
        googleLoading={googleLoading}
        error={error}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={onSubmit}
        onGoogleLogin={onGoogleLogin}
      />
    </AuthShell>
  );
}
