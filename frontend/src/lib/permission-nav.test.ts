import { MODULE_CARDS } from '../modules/home/lib/module-cards';
import { menuSections } from '../modules/layout/components/sidebar/sidebar-menu';
import { filterByPermission } from './permission-nav';
import { hasPermission, type PermissionScope } from './permissions';

const readerSession: Record<string, PermissionScope> = {
  'approvals.decide': 'assigned',
  'solicitations.view': 'own',
  'forms.view': 'all',
};
const flowsSession: Record<string, PermissionScope> = { ...readerSession, 'flows.view': 'all' };

function visibleMenu(permissions: Record<string, PermissionScope>): string[] {
  return menuSections.flatMap((section) =>
    filterByPermission(section.items, (code) => hasPermission(permissions, code)).map((item) => item.to),
  );
}
function visibleCards(permissions: Record<string, PermissionScope>): string[] {
  return filterByPermission(MODULE_CARDS, (code) => hasPermission(permissions, code)).map((card) => card.to);
}

describe('menu e atalhos do Início', () => {
  it('sem flows.view, Fluxos some do menu e dos atalhos', () => {
    expect(visibleMenu(readerSession)).not.toContain('/flows');
    expect(visibleCards(readerSession)).not.toContain('/flows');
  });

  it('com flows.view, Fluxos aparece', () => {
    expect(visibleMenu(flowsSession)).toContain('/flows');
    expect(visibleCards(flowsSession)).toContain('/flows');
  });

  it('não oferece mais Processos nem Listas de itens', () => {
    expect(visibleMenu(readerSession)).not.toContain('/formularios');
    expect(visibleMenu(readerSession)).not.toContain('/listas-de-itens');
    expect(visibleMenu({ ...readerSession, 'item_lists.manage': 'all' })).not.toContain('/listas-de-itens');
  });
});

describe('filterByPermission', () => {
  it('keeps items with no permissions requirement', () => {
    const items = [{ label: 'a' }, { label: 'b', permissions: [] }];
    const result = filterByPermission(items, () => false);
    expect(result).toHaveLength(2);
  });

  it('keeps items when the user holds at least one of the listed permissions', () => {
    const items = [{ label: 'a', permissions: ['x.manage'] }];
    const result = filterByPermission(items, (code) => code === 'x.manage');
    expect(result).toHaveLength(1);
  });

  it('drops items when the user holds none of the listed permissions', () => {
    const items = [{ label: 'a', permissions: ['x.manage'] }];
    const result = filterByPermission(items, () => false);
    expect(result).toHaveLength(0);
  });

  it('does not leak extra Array.some() args into a (code, minScope?) callback', () => {
    const permissions = { 'integrations.manage_channels': 'all' as const };
    const realHasPermission = (code: string, minScope?: Parameters<typeof hasPermission>[2]) =>
      hasPermission(permissions, code, minScope);

    const items = [
      { label: 'only item', permissions: ['integrations.manage_channels'] },
      { label: 'not first in list', permissions: ['x', 'integrations.manage_channels'] },
    ];

    const result = filterByPermission(items, realHasPermission);
    expect(result).toHaveLength(2);
  });
});
