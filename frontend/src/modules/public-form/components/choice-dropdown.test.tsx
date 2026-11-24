import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceDropdown, type ChoiceDropdownOption } from './choice-dropdown';

const few: ChoiceDropdownOption[] = [
  { id: '1', internalValue: 'sp', displayLabel: 'São Paulo' },
  { id: '2', internalValue: 'rj', displayLabel: 'Rio de Janeiro' },
  { id: '3', internalValue: 'mg', displayLabel: 'Minas Gerais' },
];

const many: ChoiceDropdownOption[] = Array.from({ length: 10 }, (_, index) => ({
  id: String(index),
  internalValue: `op${index}`,
  displayLabel: index === 7 ? 'Paraná' : `Opção ${index}`,
}));

describe('ChoiceDropdown', () => {
  it('fechada mostra o placeholder; aberta lista as opções e escolhe uma', () => {
    const onChange = vi.fn();
    render(<ChoiceDropdown options={few} value={null} onChange={onChange} />);
    expect(screen.getByText('Selecione…')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.click(screen.getByText('Rio de Janeiro'));
    expect(onChange).toHaveBeenCalledWith('rj');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('mostra o rótulo da opção escolhida e limpa com o X', () => {
    const onChange = vi.fn();
    render(<ChoiceDropdown options={few} value="mg" onChange={onChange} />);
    expect(screen.getByText('Minas Gerais')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Limpar'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('com poucas opções não mostra busca; com muitas, busca sem acento', () => {
    const { unmount } = render(<ChoiceDropdown options={few} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByLabelText('Buscar opção')).not.toBeInTheDocument();
    unmount();

    render(<ChoiceDropdown options={many} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByLabelText('Buscar opção'), { target: { value: 'parana' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Paraná')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar opção'), { target: { value: 'xyz' } });
    expect(screen.getByText('Nenhuma opção encontrada.')).toBeInTheDocument();
  });

  it('várias: marca e desmarca sem fechar, e mostra os escolhidos como chips', () => {
    const onChange = vi.fn();
    render(<ChoiceDropdown multiple options={few} value={['sp']} onChange={onChange} />);
    expect(screen.getByText('São Paulo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Minas Gerais'));
    expect(onChange).toHaveBeenLastCalledWith(['sp', 'mg']);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('São Paulo')[1]);
    expect(onChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByLabelText('Remover São Paulo'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('teclado: seta para baixo abre, Enter escolhe e Escape fecha', () => {
    const onChange = vi.fn();
    render(<ChoiceDropdown options={few} value={null} onChange={onChange} />);
    const combo = screen.getByRole('combobox');
    fireEvent.keyDown(combo, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(combo, { key: 'ArrowDown' });
    fireEvent.keyDown(combo, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('rj');

    fireEvent.keyDown(combo, { key: 'ArrowDown' });
    fireEvent.keyDown(combo, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('a lista abre fora do campo (portal) e as setas na busca andam uma opção por vez', () => {
    const onChange = vi.fn();
    const { container } = render(<ChoiceDropdown options={many} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(container.querySelector('[role=listbox]')).toBeNull();
    const busca = screen.getByLabelText('Buscar opção');
    fireEvent.change(busca, { target: { value: 'opção' } });
    fireEvent.keyDown(busca, { key: 'ArrowDown' });
    fireEvent.keyDown(busca, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('op1');
  });
});
