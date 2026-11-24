import { cn } from '../cn';

type Strength = 'weak' | 'medium' | 'strong';

function getStrength(password: string): Strength {
  if (password.length < 8) return 'weak';
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const score = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (score >= 4) return 'strong';
  if (score >= 3) return 'medium';
  return 'weak';
}

const STRENGTH_CONFIG = {
  weak: { label: 'Fraca', bars: 1, barColor: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
  medium: { label: 'Média', bars: 2, barColor: 'bg-amber-400', textColor: 'text-amber-600 dark:text-amber-400' },
  strong: { label: 'Forte', bars: 3, barColor: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
} as const;

export function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const strength = getStrength(password);
  const { label, bars, barColor, textColor } = STRENGTH_CONFIG[strength];

  return (
    <div className="mt-1.5 grid gap-1">
      <div className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              n <= bars ? barColor : 'bg-slate-200 dark:bg-slate-600',
            )}
          />
        ))}
      </div>
      <p className={cn('text-[11px] font-semibold', textColor)}>
        Força da senha: {label}
      </p>
    </div>
  );
}
