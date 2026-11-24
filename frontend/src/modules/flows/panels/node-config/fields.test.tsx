import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CheckList,
  ChoiceCards,
  Field,
  Info,
  Input,
  KeyValue,
  Segmented,
  Select,
  Toggle,
  useTabSuggestion,
} from './fields';

describe('Field', () => {
  it('mostra contador, dica e erro; o erro marca o campo como inválido', () => {
    const { container } = render(
      <Field
        label="Corpo do e-mail"
        counter="123/4000"
        hint="Aceita variáveis."
        error="Obrigatório."
      >
        <textarea aria-label="Corpo" />
      </Field>,
    );
    expect(screen.getByText('123/4000')).toBeInTheDocument();
    expect(screen.getByText('Aceita variáveis.')).toBeInTheDocument();
    expect(screen.getByText('Obrigatório.')).not.toHaveAttribute('role');
    expect(container.firstElementChild).toHaveAttribute('data-invalid');
  });

  it('errorRole="alert" anuncia o erro', () => {
    render(
      <Field label="Canal" error="Escolha o canal." errorRole="alert">
        <span />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o canal.');
  });
});

describe('Select e Input', () => {
  it('Select continua um combobox nativo', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Unidade" value="hours" onChange={(e) => onChange(e.target.value)}>
        <option value="minutes">Minutos</option>
        <option value="hours">Horas</option>
      </Select>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidade' }), {
      target: { value: 'minutes' },
    });
    expect(onChange).toHaveBeenCalledWith('minutes');
  });

  it('Input com sufixo', () => {
    render(<Input aria-label="Timeout" suffix="ms" defaultValue="15000" />);
    expect(screen.getByRole('textbox', { name: 'Timeout' })).toHaveValue('15000');
    expect(screen.getByText('ms')).toBeInTheDocument();
  });
});

describe('Segmented e ChoiceCards', () => {
  it('Segmented é um grupo de rádios', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Método HTTP"
        options={[
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ]}
        value="GET"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'GET' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'POST' }));
    expect(onChange).toHaveBeenCalledWith('POST');
  });

  it('ChoiceCards mostra título e descrição de cada opção', () => {
    const onChange = vi.fn();
    render(
      <ChoiceCards
        ariaLabel="Escopo da aprovação"
        options={[
          { value: 'solicitation', title: 'Solicitação inteira', description: 'Muda o status.' },
          { value: 'phase', title: 'Fase atual', description: 'Só a fase.' },
        ]}
        value="solicitation"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: /Solicitação inteira/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Fase atual/ }));
    expect(onChange).toHaveBeenCalledWith('phase');
  });
});

describe('CheckList', () => {
  it('cada linha é um checkbox com nome e e-mail', () => {
    const onToggle = vi.fn();
    render(
      <CheckList
        items={[
          { id: 'u1', title: 'Ana Ribeiro', subtitle: 'ana@tijuca.com.br' },
          { id: 'u2', title: 'Carlos Lima', subtitle: 'carlos@tijuca.com.br' },
        ]}
        selected={['u1']}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Ana Ribeiro/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Carlos Lima/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Carlos Lima/ }));
    expect(onToggle).toHaveBeenCalledWith('u2');
  });

  it('mostra o texto de vazio', () => {
    render(
      <CheckList
        items={[]}
        selected={[]}
        onToggle={vi.fn()}
        emptyText="Nenhum aprovador encontrado."
      />,
    );
    expect(screen.getByText('Nenhum aprovador encontrado.')).toBeInTheDocument();
  });
});

describe('Toggle', () => {
  it('é um switch nomeado pelo título, com a descrição como descrição', () => {
    const onChange = vi.fn();
    render(
      <Toggle
        title="Continuar se falhar"
        description="O fluxo segue."
        checked={false}
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Continuar se falhar' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('O fluxo segue.');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('KeyValue', () => {
  it('edita, adiciona e remove pares', () => {
    const onChange = vi.fn();
    render(<KeyValue pairs={[{ key: 'Authorization', value: 'Bearer x' }]} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Valor 1' }), {
      target: { value: 'Bearer y' },
    });
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'Authorization', value: 'Bearer y' }]);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar cabeçalho/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'Authorization', value: 'Bearer x' },
      { key: '', value: '' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remover 1' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('Info', () => {
  it('aceita texto ou conteúdo', () => {
    render(<Info text="Intervalo mínimo: 1 minuto." />);
    expect(screen.getByText('Intervalo mínimo: 1 minuto.')).toBeInTheDocument();
  });
});

function SuggestedInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const tab = useTabSuggestion(value, 'Olá {{responder_name}}', setValue);
  return (
    <div className="relative">
      <input {...tab.fieldProps} aria-label="Assunto" value={value} onChange={(event) => setValue(event.target.value)} />
      {tab.button}
    </div>
  );
}

describe('useTabSuggestion', () => {
  it('campo vazio e focado: mostra o aviso e Tab preenche com a sugestão', () => {
    render(<SuggestedInput />);
    const input = screen.getByLabelText('Assunto');
    expect(screen.queryByText('usar sugestão')).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByText('usar sugestão')).toBeInTheDocument();

    const tab = fireEvent.keyDown(input, { key: 'Tab' });
    expect(tab).toBe(false); // preventDefault: o foco fica no campo
    expect(input).toHaveValue('Olá {{responder_name}}');
    expect(screen.queryByText('usar sugestão')).not.toBeInTheDocument();
  });

  it('clicar no aviso também preenche', () => {
    render(<SuggestedInput />);
    fireEvent.focus(screen.getByLabelText('Assunto'));
    fireEvent.click(screen.getByRole('button', { name: /usar sugestão/ }));
    expect(screen.getByLabelText('Assunto')).toHaveValue('Olá {{responder_name}}');
  });

  it('com texto, Tab segue o caminho normal e nada aparece', () => {
    render(<SuggestedInput initial="Meu assunto" />);
    const input = screen.getByLabelText('Assunto');
    fireEvent.focus(input);
    expect(screen.queryByText('usar sugestão')).not.toBeInTheDocument();
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true);
    expect(input).toHaveValue('Meu assunto');
  });
});
