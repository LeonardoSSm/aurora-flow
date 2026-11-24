import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ProcessAccessCatalog, ProcessGrants } from '../services/process-access-api';
import { describeGrants, ProcessGrantsEditor } from './process-grants-editor';

const catalog: ProcessAccessCatalog = {
  permissions: [
    { code: 'solicitations.view', group: 'Solicitações', label: 'Ver solicitações', scopes: ['all', 'own'] },
    { code: 'solicitations.act', group: 'Solicitações', label: 'Atuar nos cards', scopes: ['all'] },
    { code: 'forms.edit', group: 'Estrutura', label: 'Editar o formulário', scopes: ['all'] },
  ],
  presets: [
    {
      key: 'operador',
      label: 'Operador',
      description: 'Trabalha nos cards.',
      grants: { 'solicitations.view': 'all', 'solicitations.act': 'all' },
    },
    {
      key: 'gestor',
      label: 'Gestor do processo',
      description: 'Tudo.',
      grants: { 'solicitations.view': 'all', 'solicitations.act': 'all', 'forms.edit': 'all' },
    },
  ],
};

function Harness({ initial, onChange }: { initial: ProcessGrants; onChange: (g: ProcessGrants) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ProcessGrantsEditor
      catalog={catalog}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('describeGrants', () => {
  it('nome do modelo, quantidade de permissões, ou só vê', () => {
    expect(describeGrants({ 'solicitations.view': 'all', 'solicitations.act': 'all' }, catalog.presets)).toBe(
      'Operador',
    );
    expect(describeGrants({ 'forms.edit': 'all' }, catalog.presets)).toBe('Personalizado · 1 permissão');
    expect(describeGrants({}, catalog.presets)).toBe('Só vê o processo');
  });
});

describe('ProcessGrantsEditor', () => {
  it('escolher um modelo marca as caixinhas dele', () => {
    const onChange = vi.fn();
    render(<Harness initial={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Gestor do processo' }));

    expect(onChange).toHaveBeenLastCalledWith(catalog.presets[1].grants);
    expect(screen.getByRole('checkbox', { name: 'Editar o formulário' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Gestor do processo' })).toHaveAttribute('aria-checked', 'true');
  });

  it('mexer numa caixinha sai do modelo (Personalizado)', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ ...catalog.presets[0].grants }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Atuar nos cards' }));

    expect(onChange).toHaveBeenLastCalledWith({ 'solicitations.view': 'all' });
    expect(screen.getByRole('radio', { name: 'Operador' })).toHaveAttribute('aria-checked', 'false');
  });

  it('ver solicitações pode ficar só nas minhas', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ 'solicitations.view': 'all' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Só as minhas' }));

    expect(onChange).toHaveBeenLastCalledWith({ 'solicitations.view': 'own' });
  });
});
