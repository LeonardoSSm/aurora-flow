import { describe, expect, it } from 'vitest';
import {
  applyIdentificationToggle,
  getResponderIdentificationMode,
  pickIdentificationErrors,
  validateResponderIdentification,
} from './identification';

describe('getResponderIdentificationMode', () => {
  it('formulário antigo (sem as chaves): mostra e é opcional', () => {
    expect(getResponderIdentificationMode({ mode: 'single' })).toEqual({ show: true, required: false });
    expect(getResponderIdentificationMode(undefined)).toEqual({ show: true, required: false });
  });

  it('respeita "mostrar" desligado', () => {
    expect(getResponderIdentificationMode({ showResponderIdentification: false })).toEqual({
      show: false,
      required: false,
    });
  });

  it('obrigatória força o bloco a aparecer', () => {
    expect(
      getResponderIdentificationMode({
        showResponderIdentification: false,
        requireResponderIdentification: true,
      }),
    ).toEqual({ show: true, required: true });
  });
});

describe('validateResponderIdentification', () => {
  it('opcional e em branco: passa', () => {
    expect(validateResponderIdentification('', '  ', false)).toEqual({});
  });

  it('opcional com e-mail mal formado: recusa', () => {
    expect(validateResponderIdentification('', 'ana@', false)).toEqual({
      responderEmail: 'Informe um e-mail válido.',
    });
  });

  it('obrigatória em branco: pede nome e e-mail', () => {
    expect(validateResponderIdentification(' ', '', true)).toEqual({
      responderName: 'Informe seu nome.',
      responderEmail: 'Informe seu e-mail.',
    });
  });

  it('obrigatória preenchida: passa', () => {
    expect(validateResponderIdentification('Ana', ' ana@tijuca.com ', true)).toEqual({});
  });
});

describe('applyIdentificationToggle', () => {
  it('ligar obrigatória liga também "mostrar"', () => {
    expect(
      applyIdentificationToggle({ mode: 'stepper', showResponderIdentification: false }, 'required', true),
    ).toEqual({ mode: 'stepper', showResponderIdentification: true, requireResponderIdentification: true });
  });

  it('desligar "mostrar" desliga também obrigatória', () => {
    expect(
      applyIdentificationToggle(
        { showResponderIdentification: true, requireResponderIdentification: true },
        'show',
        false,
      ),
    ).toEqual({ showResponderIdentification: false, requireResponderIdentification: false });
  });

  it('desligar obrigatória mantém o bloco à mostra', () => {
    expect(
      applyIdentificationToggle(
        { showResponderIdentification: true, requireResponderIdentification: true },
        'required',
        false,
      ),
    ).toEqual({ showResponderIdentification: true, requireResponderIdentification: false });
  });
});

describe('pickIdentificationErrors', () => {
  it('pega só as chaves de identificação do 422', () => {
    expect(
      pickIdentificationErrors({ responderEmail: 'Informe seu e-mail.', cliente: 'Obrigatório' }),
    ).toEqual({ responderEmail: 'Informe seu e-mail.' });
    expect(pickIdentificationErrors(undefined)).toEqual({});
  });
});
