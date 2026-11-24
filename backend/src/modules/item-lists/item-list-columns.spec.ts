import { BadRequestException } from '@nestjs/common';
import { normalizeColumns, sanitizeValues, type ItemListColumn } from './item-list-columns';

const columns: ItemListColumn[] = [
  { id: 'cnpj', name: 'CNPJ', type: 'text' },
  { id: 'prazo', name: 'Prazo (dias)', type: 'number' },
  { id: 'limite', name: 'Limite', type: 'currency' },
  { id: 'desde', name: 'Cliente desde', type: 'date' },
  { id: 'homologado', name: 'Homologado', type: 'checkbox' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'ok', label: 'Aprovado', color: 'green' },
      { id: 'pend', label: 'Pendente', color: 'amber' },
    ],
  },
  { id: 'site', name: 'Site', type: 'url' },
];

describe('normalizeColumns', () => {
  it('apara nomes e só guarda opções na coluna de seleção', () => {
    expect(
      normalizeColumns([
        {
          id: 'a',
          name: '  CNPJ ',
          type: 'text',
          options: [{ id: 'x', label: 'X', color: 'red' }],
        },
        {
          id: 'b',
          name: 'Status',
          type: 'select',
          options: [{ id: 'x', label: ' Ativo ', color: 'green' }],
        },
      ]),
    ).toEqual([
      { id: 'a', name: 'CNPJ', type: 'text' },
      {
        id: 'b',
        name: 'Status',
        type: 'select',
        options: [{ id: 'x', label: 'Ativo', color: 'green' }],
      },
    ]);
  });

  it('recusa nome repetido (inclusive com as colunas fixas) e opção repetida', () => {
    expect(() =>
      normalizeColumns([
        { id: 'a', name: 'Prazo', type: 'number' },
        { id: 'b', name: ' prazo', type: 'text' },
      ]),
    ).toThrow('Já existe uma coluna chamada "prazo".');
    expect(() => normalizeColumns([{ id: 'a', name: 'Nome', type: 'text' }])).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeColumns([
        {
          id: 'a',
          name: 'Status',
          type: 'select',
          options: [
            { id: '1', label: 'Ok', color: 'green' },
            { id: '2', label: 'OK', color: 'red' },
          ],
        },
      ]),
    ).toThrow('Duas opções "OK" na coluna "Status".');
  });
});

describe('sanitizeValues', () => {
  it('guarda cada valor no tipo da coluna e descarta vazios, "não" e colunas que não existem', () => {
    expect(
      sanitizeValues(
        columns,
        {
          cnpj: ' 12.345.678/0001-90 ',
          prazo: '30',
          limite: '1500,50',
          desde: '2024-03-01',
          homologado: false,
          status: 'ok',
          site: '',
          removida: 'sobra',
        },
        'Alfa',
      ),
    ).toEqual({
      cnpj: '12.345.678/0001-90',
      prazo: 30,
      limite: 1500.5,
      desde: '2024-03-01',
      status: 'ok',
    });
    expect(sanitizeValues(columns, { homologado: true }, 'Alfa')).toEqual({ homologado: true });
    expect(sanitizeValues(columns, null, 'Alfa')).toEqual({});
  });

  it.each([
    ['prazo', 'trinta'],
    ['desde', '01/03/2024'],
    ['desde', '2024-02-31x'],
    ['homologado', 'sim'],
    ['status', 'sumiu'],
    ['cnpj', 123],
  ])('recusa valor inválido (%s = %p)', (column, value) => {
    expect(() => sanitizeValues(columns, { [column]: value }, 'Alfa')).toThrow(
      /Valor inválido na coluna ".+" do item "Alfa"\./,
    );
  });
});
