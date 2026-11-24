import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useGreeting } from '../hooks/use-greeting';

type GreetingBannerProps = {
  userFullName: string;
};

export function GreetingBanner({ userFullName }: GreetingBannerProps) {
  const navigate = useNavigate();
  const { greeting, firstName } = useGreeting(userFullName);
  const { hasPermission } = useAuth();

  return (
    <div className="relative shrink-0 overflow-hidden rounded-[20px] bg-brand-primary-light">
      <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-8">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-brand-primary">
            {greeting}, {firstName}
          </p>
          <h1 className="font-headline text-[24px] font-extrabold md:text-[28px] text-[#1A1A2E]">
            O que você quer automatizar hoje?
          </h1>
        </div>

        {hasPermission('flows.manage') ? (
          <button
            type="button"
            onClick={() => navigate('/flows/new')}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] bg-brand-primary px-[22px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Novo fluxo
          </button>
        ) : null}
      </div>
    </div>
  );
}
