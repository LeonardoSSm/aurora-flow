import { AuthShell } from '../components/auth-shell';
import { SetPasswordCard } from '../components/set-password-card';
import { useSetPasswordForm } from '../hooks/use-set-password-form';

export function SetPasswordView() {
  const {
    email,
    isChange,
    currentPassword,
    password,
    confirmPassword,
    error,
    loading,
    setCurrentPassword,
    setPassword,
    setConfirmPassword,
    onSubmit,
    onSkip,
  } = useSetPasswordForm();

  return (
    <AuthShell>
      <SetPasswordCard
        email={email}
        isChange={isChange}
        currentPassword={currentPassword}
        password={password}
        confirmPassword={confirmPassword}
        loading={loading}
        error={error}
        onCurrentPasswordChange={setCurrentPassword}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />
    </AuthShell>
  );
}
