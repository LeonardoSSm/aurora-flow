import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { approverKeys, ApproversField, type ApprovalRule, type ApproverSelection } from './approvers-field';

const roles = [
  { value: 'gerente', label: 'Gerente' },
  { value: 'diretoria', label: 'Diretoria' },
];
const users = [
  { value: 'u-ana', label: 'Ana Souza', hint: 'ana@x.com' },
  { value: 'u-joao', label: 'João Lima', hint: 'joao@x.com' },
];

function Harness({ initial, onChange }: { initial: ApproverSelection; onChange: (v: ApproverSelection, r: ApprovalRule) => void }) {
  const [value, setValue] = useState(initial);
  const [rule, setRule] = useState<ApprovalRule>('any');
  return (
    <ApproversField
      value={value}
      rule={rule}
      onChange={(next) => {
        setValue(next);
        onChange(next, rule);
      }}
      onRuleChange={(next) => {
        setRule(next);
        onChange(value, next);
      }}
      roleOptions={roles}
      userOptions={users}
    />
  );
}

describe('approverKeys', () => {
  it('ordem guardada primeiro (só de quem está), quem faltar no fim', () => {
    expect(approverKeys({ roleCodes: ['gerente'], userIds: ['u-ana', 'u-joao'], order: ['user:u-joao', 'role:gerente', 'user:sumiu'] })).toEqual([
      'user:u-joao',
      'role:gerente',
      'user:u-ana',
    ]);
    expect(approverKeys({ roleCodes: ['gerente'], userIds: ['u-ana'] })).toEqual(['user:u-ana', 'role:gerente']);
  });
});

describe('ApproversField', () => {
  it('a janela escolhe vários perfis e usuários, com busca; cancelar não muda nada', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ roleCodes: [], userIds: [] }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Escolher aprovadores' }));
    let janela = screen.getByRole('dialog', { name: 'Escolher aprovadores' });
    fireEvent.click(within(janela).getByRole('option', { name: /Gerente/ }));
    fireEvent.click(within(janela).getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Escolher aprovadores' }));
    janela = screen.getByRole('dialog', { name: 'Escolher aprovadores' });
    fireEvent.click(within(janela).getByRole('option', { name: /Diretoria/ }));
    fireEvent.click(within(janela).getByRole('tab', { name: /Usuários/ }));
    fireEvent.change(within(janela).getByLabelText('Buscar usuário'), { target: { value: 'joao@' } });
    expect(within(janela).getAllByRole('option')).toHaveLength(1);
    fireEvent.click(within(janela).getByRole('option', { name: /João Lima/ }));
    expect(within(janela).getByText('1 perfil(is) · 1 usuário(s)')).toBeInTheDocument();
    fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar' }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ roleCodes: ['diretoria'], userIds: ['u-joao'] }), 'any');
    expect(screen.getByText('Diretoria')).toBeInTheDocument();
    expect(screen.getByText('qualquer pessoa do perfil')).toBeInTheDocument();
  });

  it('"Em ordem" numera e reordena a fila; tirar um aprovador também tira da fila', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ roleCodes: ['gerente'], userIds: ['u-ana'] }} onChange={onChange} />);
    expect(screen.queryByText('1.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /^Em ordem/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.anything(), 'sequential');
    expect(screen.getByText('1.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Subir Gerente' }));
    expect(onChange).toHaveBeenLastCalledWith(
      { roleCodes: ['gerente'], userIds: ['u-ana'], order: ['role:gerente', 'user:u-ana'] },
      'sequential',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tirar Ana Souza' }));
    expect(onChange).toHaveBeenLastCalledWith({ roleCodes: ['gerente'], userIds: [], order: ['role:gerente'] }, 'sequential');
  });
});
