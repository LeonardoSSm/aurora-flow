import { LayoutGrid, MousePointerClick } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ProductLogo } from '../../../brand/components/product-logo';
import { type ExperienceMode, rememberExperienceMode, setExperienceMode } from '../experience-mode-store';

type ModeOptionProps = {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

function ModeOption({ icon, title, description, onClick }: ModeOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border-default bg-bg-surface p-6 text-center transition-colors hover:border-primary hover:bg-bg-hover focus-visible:border-primary focus-visible:outline-none"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-white">{icon}</span>
      <span className="text-xl font-bold text-tx-primary">{title}</span>
      <span className="text-sm text-tx-secondary">{description}</span>
    </button>
  );
}

/**
 * Primeira tela depois de entrar: o usuário escolhe como quer usar o sistema. Marcando
 * "lembrar", as próximas entradas abrem direto no modo escolhido.
 */
export function ModeChoiceView({ userId }: { userId: string | undefined }) {
  const [remember, setRemember] = useState(false);

  const choose = (mode: ExperienceMode) => () => {
    if (remember && userId) rememberExperienceMode(userId, mode);
    setExperienceMode(mode);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-base px-4 py-10">
      <ProductLogo className="text-tx-primary" markClassName="h-12 w-12" />

      <h1 className="text-center text-2xl font-bold text-tx-primary">Como você quer usar o sistema?</h1>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <ModeOption
          icon={<MousePointerClick className="h-7 w-7" />}
          title="Modo simplificado"
          description="Só o essencial: um botão para criar processo."
          onClick={choose('simple')}
        />
        <ModeOption
          icon={<LayoutGrid className="h-7 w-7" />}
          title="Modo avançado"
          description="O sistema completo, com todos os menus."
          onClick={choose('advanced')}
        />
      </div>

      {userId ? (
        <label className="flex max-w-2xl cursor-pointer items-start gap-3 text-sm text-tx-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            <span className="font-semibold text-tx-primary">Lembrar minha escolha</span> e abrir sempre neste modo ao
            entrar. Dá para trocar depois pelo botão de modo.
          </span>
        </label>
      ) : null}
    </div>
  );
}
