import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { filterByPermission } from '../../../lib/permission-nav';
import { SidebarIcon } from '../../layout/components/sidebar/sidebar-icon';
import { MODULE_CARDS, MODULE_CARD_TONE_CLASSES } from '../lib/module-cards';

/** Atalhos para as telas do menu — o conteúdo principal da coluna esquerda do Início. */
export function ModuleGrid() {
  const { hasPermission } = useAuth();
  const visibleModules = filterByPermission(MODULE_CARDS, hasPermission);

  return (
    <section className="shrink-0">
      <h2 className="mb-3 text-base font-bold text-tx-primary">Atalhos</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {visibleModules.map((module) => {
          const tone = MODULE_CARD_TONE_CLASSES[module.tone];

          return (
            <Link
              key={module.to}
              to={module.to}
              className="group flex flex-col gap-3.5 rounded-2xl border border-border-default bg-bg-surface p-6 no-underline transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-brand-primary hover:shadow-[0_12px_28px_rgba(26,60,143,0.12)]"
            >
              <span className={['grid h-11 w-11 place-items-center rounded-xl', tone.bg].join(' ')}>
                <SidebarIcon name={module.icon} className={['h-[22px] w-[22px]', tone.fg].join(' ')} />
              </span>
              <span>
                <span className="mb-1 block text-base font-bold text-tx-primary">{module.name}</span>
                <span className="block text-[13px] leading-[1.5] text-tx-muted">{module.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
