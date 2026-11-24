import { parseInboundList } from './inbound-list.parser';

describe('parseInboundList', () => {
  it.each([
    ['um por linha', '123\n456\n789'],
    ['quebra de linha do Windows e linhas vazias', '123\r\n\r\n456\r\n789\r\n'],
    ['vírgula numa linha só', '123, 456,789'],
    ['ponto e vírgula', '123;456;789'],
    ['tab', '123\t456\t789'],
    ['espaços', '123 456   789'],
    ['cabeçalho de uma coluna', 'pedido\n123\n456\n789'],
    ['BOM do Excel no começo', '﻿123\n456\n789'],
    ['repetidos contam uma vez', '123\n456\n123\n789\n456'],
  ])('%s', (_caso, content) => {
    expect(parseInboundList(content)).toEqual(['123', '456', '789']);
  });

  it('CSV com cabeçalho: pega a coluna do pedido, mesmo que não seja a primeira', () => {
    const csv = 'Cliente;Número do Pedido;Valor\nMercado A;123;10,50\nMercado B;456;99,90';
    expect(parseInboundList(csv)).toEqual(['123', '456']);
  });

  it('CSV com cabeçalho sem coluna reconhecível: a primeira', () => {
    expect(parseInboundList('id,cliente\n123,Mercado A\n456,Mercado B')).toEqual(['123', '456']);
  });

  it('CSV sem cabeçalho: a primeira coluna', () => {
    expect(parseInboundList('123;Mercado A\n456;Mercado B')).toEqual(['123', '456']);
  });

  it('valores entre aspas', () => {
    expect(parseInboundList('"pedido"\n"PC-123"\n"PC-456"')).toEqual(['PC-123', 'PC-456']);
  });

  it('conteúdo vazio ou só cabeçalho não tem itens', () => {
    expect(parseInboundList('')).toEqual([]);
    expect(parseInboundList('  \n \n')).toEqual([]);
    expect(parseInboundList('pedido')).toEqual(['pedido']);
  });
});
