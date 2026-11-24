import { describe, expect, it } from 'vitest';
import {
  autoMatchedFields,
  forwardCompatibility,
  forwardSourceFields,
  forwardTargetFields,
} from '../forward-mapping';

const campo = (code: string, fieldType: string, phaseLabel?: string) => ({
  code,
  label: code.toUpperCase(),
  fieldType,
  ...(phaseLabel ? { phaseLabel } : {}),
});

describe('forward-mapping', () => {
  it('destino: só campos do formulário que recebem resposta', () => {
    const campos = [
      campo('nome', 'short_text'),
      campo('titulo', 'title'),
      campo('total', 'calculated'),
      campo('doc', 'file_upload'),
      campo('obs_fase', 'long_text', 'Triagem'),
    ];
    expect(forwardTargetFields(campos).map((c) => c.code)).toEqual(['nome']);
    // Na origem, campos de fase e cálculos dão valor.
    expect(forwardSourceFields(campos).map((c) => c.code)).toEqual(['nome', 'total', 'doc', 'obs_fase']);
  });

  it('compatibilidade espelha a conversão do servidor', () => {
    expect(forwardCompatibility('item_order', 'item_order')).toBe('ok');
    expect(forwardCompatibility('single_select', 'short_text')).toBe('ok');
    expect(forwardCompatibility('number', 'currency')).toBe('ok');
    expect(forwardCompatibility('short_text', 'number')).toBe('convert');
    expect(forwardCompatibility(null, 'checkbox')).toBe('convert');
    expect(forwardCompatibility(null, 'long_text')).toBe('ok');
    expect(forwardCompatibility('short_text', 'erp_lookup')).toBe('incompatible');
    expect(forwardCompatibility(null, 'item_order')).toBe('incompatible');
    expect(forwardCompatibility('item_order', 'long_text')).toBe('incompatible');
  });

  it('mesmo código vai sozinho, menos o que foi mapeado à mão', () => {
    const destino = [campo('nome', 'short_text'), campo('cpf', 'cpf'), campo('pedido', 'erp_lookup')];
    const origem = [campo('nome', 'short_text'), campo('cpf', 'short_text'), campo('pedido', 'short_text')];

    const auto = autoMatchedFields(destino, origem, [{ targetFieldCode: 'nome', sourceFieldCode: 'apelido' }]);

    expect(auto.map(({ target, compatibility }) => [target.code, compatibility])).toEqual([
      ['cpf', 'convert'],
      ['pedido', 'incompatible'],
    ]);
  });
});
