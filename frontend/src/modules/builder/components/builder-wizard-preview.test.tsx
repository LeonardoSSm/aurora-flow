import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildInitialDraft } from '../state/draft.helpers';
import type { FormDraft } from '../types';
import { BuilderWizardPreview } from './builder-wizard-preview';

function draftWith(settings: Partial<FormDraft['settingsJson']>): FormDraft {
  const draft = buildInitialDraft();
  return { ...draft, name: 'Teste', settingsJson: { ...draft.settingsJson, ...settings } };
}

describe('BuilderWizardPreview — identificação de quem responde', () => {
  it('obrigatória: a prévia começa pela tela de entrada e só mostra as perguntas depois', () => {
    render(
      <BuilderWizardPreview
        draft={draftWith({ requireResponderIdentification: true, showResponderIdentification: true })}
      />,
    );
    expect(screen.getByText('Antes de começar, identifique-se')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Começar a responder' }));
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Começar a responder' }));

    expect(screen.queryByText('Antes de começar, identifique-se')).not.toBeInTheDocument();
    expect(screen.getByText(/Respondendo como/)).toHaveTextContent('Ana');
  });

  it('opcional: o bloco aparece acima das perguntas; desligada, não aparece', () => {
    const { unmount } = render(
      <BuilderWizardPreview draft={draftWith({ showResponderIdentification: true })} />,
    );
    expect(screen.getByText('(opcional)')).toBeInTheDocument();
    unmount();

    render(
      <BuilderWizardPreview
        draft={draftWith({ showResponderIdentification: false, requireResponderIdentification: false })}
      />,
    );
    expect(screen.queryByText('(opcional)')).not.toBeInTheDocument();
    expect(screen.queryByText('Antes de começar, identifique-se')).not.toBeInTheDocument();
  });
});
