import {
  requiresResponderIdentification,
  resolveResponderIdentity,
  validateResponderIdentity,
} from './responder-identification';

const REQUIRED = { mode: 'single', requireResponderIdentification: true };
const LOGGED = { email: 'ana@tijuca.com', fullName: 'Ana Souza' };

describe('requiresResponderIdentification', () => {
  it.each([
    [undefined, false],
    [null, false],
    [{}, false],
    [{ requireResponderIdentification: false }, false],
    [{ requireResponderIdentification: 'true' }, false],
    [{ requireResponderIdentification: true }, true],
  ])('%j → %s', (settings, expected) => {
    expect(requiresResponderIdentification(settings as never)).toBe(expected);
  });
});

describe('resolveResponderIdentity', () => {
  it('apara espaços e transforma vazio em null', () => {
    expect(resolveResponderIdentity({}, { responderName: '  Ana ', responderEmail: '   ' }, null)).toEqual(
      { responderName: 'Ana', responderEmail: null },
    );
  });

  it('sem a opção, não preenche com o usuário logado (anônimo continua anônimo)', () => {
    expect(resolveResponderIdentity({}, {}, LOGGED)).toEqual({
      responderName: null,
      responderEmail: null,
    });
  });

  it('com a opção e campos em branco, usa o usuário logado', () => {
    expect(resolveResponderIdentity(REQUIRED, {}, LOGGED)).toEqual({
      responderName: 'Ana Souza',
      responderEmail: 'ana@tijuca.com',
    });
  });

  it('com a opção, o que a pessoa digitou vale mais que o usuário logado', () => {
    expect(
      resolveResponderIdentity(
        REQUIRED,
        { responderName: 'Bia', responderEmail: 'bia@x.com' },
        LOGGED,
      ),
    ).toEqual({ responderName: 'Bia', responderEmail: 'bia@x.com' });
  });
});

describe('validateResponderIdentity', () => {
  it('sem a opção, nunca reclama', () => {
    expect(validateResponderIdentity({}, { responderName: null, responderEmail: null })).toEqual({});
  });

  it('com a opção, exige nome e e-mail', () => {
    expect(
      validateResponderIdentity(REQUIRED, { responderName: null, responderEmail: null }),
    ).toEqual({ responderName: 'Informe seu nome.', responderEmail: 'Informe seu e-mail.' });
  });

  it('com a opção, recusa e-mail mal formado', () => {
    expect(
      validateResponderIdentity(REQUIRED, { responderName: 'Ana', responderEmail: 'ana@' }),
    ).toEqual({ responderEmail: 'Informe um e-mail válido.' });
  });

  it('com a opção e tudo preenchido, passa', () => {
    expect(
      validateResponderIdentity(REQUIRED, { responderName: 'Ana', responderEmail: 'ana@x.com' }),
    ).toEqual({});
  });
});
