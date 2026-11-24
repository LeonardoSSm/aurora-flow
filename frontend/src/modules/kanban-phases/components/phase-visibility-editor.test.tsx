import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { visibilitySummary } from '../lib/phase-visibility';
import type { KanbanPhaseVisibility } from '../types';
import { PhaseVisibilityEditor } from './phase-visibility-editor';

vi.mock('../services/kanban-phases-api', () => ({
  fetchAreaOptions: () => Promise.resolve([{ id: 'area-exp', name: 'Expedição' }]),
}));
vi.mock('../../users/services/users-api', () => ({
  fetchAssignableUsers: () =>
    Promise.resolve([{ id: 'u-ana', fullName: 'Ana Gerente', email: 'ana@x.com', role: 'manager' }]),
}));

const ROLES = [
  { code: 'logistica', name: 'Logística' },
  { code: 'financeiro', name: 'Financeiro' },
  { code: 'manager', name: 'Gerente' },
];
const EMPTY: KanbanPhaseVisibility = { roleCodes: [], areaIds: [], userIds: [] };

function renderEditor(initial = { restrictVisibility: false, visibleTo: EMPTY }) {
  const changes: Array<{ restrictVisibility: boolean; visibleTo: KanbanPhaseVisibility }> = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <PhaseVisibilityEditor
        restrict={value.restrictVisibility}
        visibleTo={value.visibleTo}
        roleOptions={ROLES}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { last: () => changes[changes.length - 1] };
}

describe('PhaseVisibilityEditor', () => {
  it('começa em "Todos com acesso" e não mostra as listas', () => {
    renderEditor();
    expect(screen.getByRole('radio', { name: /Todos com acesso/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Perfis')).not.toBeInTheDocument();
  });

  it('"Só quem eu escolher" permite marcar vários perfis, áreas e usuários', async () => {
    const { last } = renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: /Só quem eu escolher/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos um');

    const perfis = screen.getByText('Perfis').closest('div.grid') as HTMLElement;
    fireEvent.click(within(perfis).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(within(perfis).getByRole('option', { name: /Logística/ }));
    fireEvent.click(within(perfis).getByRole('option', { name: /Financeiro/ }));
    expect(last().visibleTo.roleCodes).toEqual(['logistica', 'financeiro']);

    const areas = screen.getByText('Áreas').closest('div.grid') as HTMLElement;
    fireEvent.click(within(areas).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(await within(areas).findByRole('option', { name: /Expedição/ }));

    const usuarios = screen.getByText('Usuários').closest('div.grid') as HTMLElement;
    fireEvent.click(within(usuarios).getByRole('button', { name: /Adicionar/ }));
    fireEvent.change(within(usuarios).getByLabelText('Buscar por nome ou e-mail'), { target: { value: 'ana@' } });
    fireEvent.click(await within(usuarios).findByRole('option', { name: /Ana Gerente/ }));

    expect(last()).toEqual({
      restrictVisibility: true,
      visibleTo: { roleCodes: ['logistica', 'financeiro'], areaIds: ['area-exp'], userIds: ['u-ana'] },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Tirar pelo chip
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Financeiro' }));
    expect(last().visibleTo.roleCodes).toEqual(['logistica']);
  });

  it('valor salvo que não existe mais aparece marcado para poder ser tirado', () => {
    renderEditor({ restrictVisibility: true, visibleTo: { ...EMPTY, roleCodes: ['perfil_apagado'] } });
    expect(screen.getByText('perfil_apagado (não encontrado)')).toBeInTheDocument();
  });
});

describe('visibilitySummary', () => {
  it('resume para os chips', () => {
    expect(visibilitySummary(false, { ...EMPTY, roleCodes: ['logistica'] }, ROLES)).toBe('todos');
    expect(visibilitySummary(true, { ...EMPTY, roleCodes: ['logistica'] }, ROLES)).toBe('Logística');
    expect(
      visibilitySummary(true, { roleCodes: ['logistica', 'financeiro', 'manager'], areaIds: ['a'], userIds: [] }, ROLES),
    ).toBe('Logística, Financeiro +2');
    expect(visibilitySummary(true, { roleCodes: [], areaIds: ['a', 'b'], userIds: ['u'] }, ROLES)).toBe(
      '2 áreas + 1 usuário',
    );
  });
});
