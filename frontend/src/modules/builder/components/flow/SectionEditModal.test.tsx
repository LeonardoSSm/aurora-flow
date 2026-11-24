import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui';
import type { DraftField, DraftSection } from '../../types';
import { SectionEditModal } from './SectionEditModal';

function makeField(id: string, label: string, overrides: Partial<DraftField> = {}): DraftField {
  return {
    id,
    code: id,
    label,
    fieldType: 'short_text',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

function makeSection(id: string, title: string, fields: DraftField[]): DraftSection {
  return {
    id,
    serverId: null,
    title,
    description: '',
    nextSectionId: null,
    nextIsSubmit: true,
    flowPositionX: null,
    flowPositionY: null,
    branches: [],
    fields,
  };
}

const sections = [
  makeSection('s1', 'Dados do solicitante', [
    makeField('f1', 'Nome completo', { required: true }),
    makeField('f2', 'E-mail', { fieldType: 'email' }),
    makeField('f3', 'Valor unitário', { fieldType: 'currency' }),
    makeField('f4', 'Valor total', { fieldType: 'number' }),
  ]),
  makeSection('s2', 'Itens', [makeField('g1', 'Descrição do material')]),
];

function Harness({ onAddField = () => 'novo' }: { onAddField?: () => string | void }) {
  const [sectionId, setSectionId] = useState('s1');
  const section = sections.find((item) => item.id === sectionId) as DraftSection;
  return (
    <SectionEditModal
      section={section}
      sections={sections}
      formId={null}
      availableFields={[]}
      onClose={() => {}}
      onSelectSection={setSectionId}
      onUpdateSection={() => {}}
      onRemoveSection={() => {}}
      canRemoveSection
      onAddField={onAddField}
      onRemoveField={() => {}}
      onUpdateField={() => {}}
      onMoveField={() => {}}
      onSetSectionFlow={() => {}}
    />
  );
}

function renderModal(props: { onAddField?: () => string | void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Cabeçalho clicável da linha (o rótulo acessível começa pelo rótulo do campo). */
function rowHeader(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^${label} —`) });
}

describe('SectionEditModal — accordion de campos', () => {
  it('abre uma linha por vez: abrir outra fecha a anterior', () => {
    renderModal();

    expect(rowHeader('Nome completo')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText('Rótulo do campo')).not.toBeInTheDocument();

    fireEvent.click(rowHeader('Nome completo'));
    expect(rowHeader('Nome completo')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByDisplayValue('Nome completo')).toBeInTheDocument();

    fireEvent.click(rowHeader('E-mail'));
    expect(rowHeader('E-mail')).toHaveAttribute('aria-expanded', 'true');
    expect(rowHeader('Nome completo')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByPlaceholderText('Rótulo do campo')).toHaveLength(1);

    // Clicar de novo na linha aberta fecha.
    fireEvent.click(rowHeader('E-mail'));
    expect(screen.queryByPlaceholderText('Rótulo do campo')).not.toBeInTheDocument();
  });

  it('o grip arrasta mas não abre a linha', () => {
    renderModal();
    const header = rowHeader('Nome completo');
    fireEvent.click(within(header).getByRole('button', { name: 'Arrastar para reordenar' }));
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('"Recolher" fecha a linha aberta', () => {
    renderModal();
    fireEvent.click(rowHeader('Nome completo'));
    fireEvent.click(screen.getByRole('button', { name: /Recolher/ }));
    expect(rowHeader('Nome completo')).toHaveAttribute('aria-expanded', 'false');
  });

  it('trocar de seção recolhe as linhas e limpa a busca', () => {
    renderModal();
    fireEvent.click(rowHeader('Nome completo'));
    fireEvent.change(screen.getByLabelText('Buscar campo nesta seção'), {
      target: { value: 'nome' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Próxima seção: Itens' }));
    expect(screen.getByText('Seção 2 de 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar campo nesta seção')).toHaveValue('');
    expect(rowHeader('Descrição do material')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Seção anterior: Dados do solicitante' }));
    expect(rowHeader('Nome completo')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SectionEditModal — busca de campos', () => {
  it('mostra só as linhas que batem, mantendo a numeração original', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar campo nesta seção'), {
      target: { value: 'VÁLOR' },
    });

    expect(screen.queryByText('Nome completo')).not.toBeInTheDocument();
    expect(rowHeader('Valor unitário')).toBeInTheDocument();
    expect(within(rowHeader('Valor unitário')).getByText('03')).toBeInTheDocument();
    expect(within(rowHeader('Valor total')).getByText('04')).toBeInTheDocument();
  });

  it('sem resultado mostra "Nenhum campo encontrado."', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar campo nesta seção'), {
      target: { value: 'fornecedor' },
    });
    expect(screen.getByText('Nenhum campo encontrado.')).toBeInTheDocument();
  });

  it('resume a seção contando só campos que recebem resposta', () => {
    renderModal();
    expect(screen.getByText('4 campos · 1 obrigatório')).toBeInTheDocument();
  });
});

describe('SectionEditModal — seletor de tipos', () => {
  it('abre com a busca em foco, filtra e mostra "Nenhum tipo encontrado."', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar campo/ })[0]);

    const picker = screen.getByRole('dialog', { name: 'Adicionar campo' });
    const search = within(picker).getByLabelText('Buscar tipo de campo');
    expect(search).toHaveFocus();
    expect(within(picker).getByRole('button', { name: 'Texto Curto' })).toBeInTheDocument();
    // Sem ERP_TABLE_ENABLED, a tabela dinâmica do ERP fica de fora.
    expect(within(picker).queryByRole('button', { name: 'Tabela dinâmica do ERP' })).toBeNull();

    fireEvent.change(search, { target: { value: 'número' } });
    expect(within(picker).getByRole('button', { name: 'Número' })).toBeInTheDocument();
    expect(within(picker).queryByRole('button', { name: 'Texto Curto' })).toBeNull();

    fireEvent.change(search, { target: { value: 'xyz' } });
    expect(within(picker).getByText('Nenhum tipo encontrado.')).toBeInTheDocument();
  });

  it('escolher um tipo adiciona o campo, fecha o seletor e abre a linha nova', () => {
    const onAddField = vi.fn(() => 'f2');
    renderModal({ onAddField });
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar campo/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'E-mail' }));

    expect(onAddField).toHaveBeenCalledWith('email');
    expect(screen.queryByRole('dialog', { name: 'Adicionar campo' })).toBeNull();
    // O harness devolve o id de um campo que já existe ("E-mail"): ele abre expandido.
    expect(rowHeader('E-mail')).toHaveAttribute('aria-expanded', 'true');
  });

  it('o botão de tipo do painel abre o seletor no modo "trocar tipo", com o tipo atual marcado', () => {
    renderModal();
    fireEvent.click(rowHeader('E-mail'));
    fireEvent.click(screen.getByRole('button', { name: 'Tipo do campo' }));

    const picker = screen.getByRole('dialog', { name: 'Trocar tipo do campo' });
    expect(within(picker).getByRole('button', { name: 'E-mail' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Esc fecha primeiro o seletor e depois o modal', () => {
    const onClose = vi.fn();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SectionEditModal
            section={sections[0]}
            sections={sections}
            formId={null}
            availableFields={[]}
            onClose={onClose}
            onSelectSection={() => {}}
            onUpdateSection={() => {}}
            onRemoveSection={() => {}}
            canRemoveSection
            onAddField={() => {}}
            onRemoveField={() => {}}
            onUpdateField={() => {}}
            onMoveField={() => {}}
            onSetSectionFlow={() => {}}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar campo/ })[0]);
    expect(screen.getByRole('dialog', { name: 'Adicionar campo' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Adicionar campo' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SectionEditModal — Esc', () => {
  it('Esc fecha o modal', () => {
    const onClose = vi.fn();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SectionEditModal
            section={sections[0]}
            sections={sections}
            formId={null}
            availableFields={[]}
            onClose={onClose}
            onSelectSection={() => {}}
            onUpdateSection={() => {}}
            onRemoveSection={() => {}}
            canRemoveSection
            onAddField={() => {}}
            onRemoveField={() => {}}
            onUpdateField={() => {}}
            onMoveField={() => {}}
            onSetSectionFlow={() => {}}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
