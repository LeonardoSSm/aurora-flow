import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FormEntity, FormVersionEntity, KanbanPhaseEntity } from '../../../database/entities';
import { CreateFormDto } from '../../forms/dto/create-form.dto';
import { blueprintToFormDto } from './blueprint-to-dtos';
import { EXAMPLE_PROCESS } from './example-blueprint';
import type { ProcessBlueprint } from './process-blueprint.types';
import { processToBlueprint } from './process-to-blueprint';
import { validateBlueprint, type BlueprintContext } from './validate-blueprint';

/**
 * Opções do processo no settingsJson da versão (identificação no formulário público e aprovação
 * da resposta). A LOPS IA refaz um processo exportando (GET /ai/processes/:id) e criando de novo:
 * o que não viaja no processo volta ao padrão no processo recriado.
 */

const ctx: BlueprintContext = {
  roleCodes: new Set(['compras', 'gerente', 'diretor']),
  userIdByEmail: new Map([['ana@empresa.com', 'user-ana']]),
  areaIds: new Set(['area-compras']),
  itemListIds: new Set(),
};

const clone = (): ProcessBlueprint => JSON.parse(JSON.stringify(EXAMPLE_PROCESS)) as ProcessBlueprint;
const messages = (bp: unknown) => validateBlueprint(bp, ctx).errors.map((issue) => `${issue.path}: ${issue.message}`);

/** Processo mínimo como vem do banco: uma seção, uma fase de entrada e uma terminal. */
function exportInput(settingsJson: Record<string, unknown>) {
  const version = {
    settingsJson,
    sections: [
      {
        id: 'sec-1',
        title: 'Dados',
        order: 0,
        nextSectionId: null,
        nextIsSubmit: true,
        branches: [],
        fields: [{ id: 'f-1', code: 'nome', label: 'Nome', fieldType: 'short_text', required: true, isSensitive: false, order: 0, options: [], settingsJson: {}, visibilityRules: null }],
      },
    ],
  } as unknown as FormVersionEntity;
  const phase = (id: string, key: string, order: number, isTerminal: boolean) =>
    ({ id, key, label: key, color: 'blue', order, isTerminal, requiresApproval: false, fields: [] }) as unknown as KanbanPhaseEntity;
  return {
    form: { name: 'Pedido', description: null, category: null, areaId: null, kanbanSettings: null } as unknown as FormEntity,
    version,
    phases: [phase('p-1', 'triagem', 0, false), phase('p-2', 'concluido', 1, true)],
    flows: [],
    emailByUserId: new Map<string, string>(),
  };
}

const ACTOR_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

async function dtoErrors(bp: ProcessBlueprint): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateFormDto, blueprintToFormDto(bp, ACTOR_ID)), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.toString());
}

describe('opções do processo no form (settingsJson da versão)', () => {
  it('refazer pela IA mantém identificação obrigatória, bloco escondido e aprovação da resposta', async () => {
    const settings = {
      mode: 'stepper',
      showResponderIdentification: false,
      requireResponderIdentification: true,
      requiresResponseApproval: true,
    };
    const bp = processToBlueprint(exportInput(settings));
    expect(bp.form).toEqual(
      expect.objectContaining({
        mode: 'stepper',
        showResponderIdentification: false,
        requireResponderIdentification: true,
        requiresResponseApproval: true,
      }),
    );
    expect(messages(bp)).toEqual([]);

    // O processo exportado passa por JSON (é o que a IA recebe e devolve).
    const roundTrip = JSON.parse(JSON.stringify(bp)) as ProcessBlueprint;
    expect(blueprintToFormDto(roundTrip, 'user-ana').settingsJson).toEqual(settings);
    expect(await dtoErrors(roundTrip)).toEqual([]);
  });

  it('opção no padrão não sai no processo exportado e o recriado continua no padrão', () => {
    const bp = processToBlueprint(
      exportInput({ mode: 'single', showResponderIdentification: true, requireResponderIdentification: false }),
    );
    expect(Object.keys(bp.form).sort()).toEqual(['mode', 'sections']);
    expect(blueprintToFormDto(bp, 'user-ana').settingsJson).toEqual({ mode: 'single' });
  });

  it('processo antigo, sem as chaves, sai e volta igual', () => {
    const bp = processToBlueprint(exportInput({ mode: 'single' }));
    expect(blueprintToFormDto(bp, 'user-ana').settingsJson).toEqual({ mode: 'single' });
  });

  it('processo novo da IA: só entra o que ela mandou', async () => {
    const bp = clone();
    expect(blueprintToFormDto(bp, 'user-ana').settingsJson).toEqual({ mode: 'stepper' });

    bp.form.requireResponderIdentification = true;
    expect(messages(bp)).toEqual([]);
    expect(blueprintToFormDto(bp, 'user-ana').settingsJson).toEqual({ mode: 'stepper', requireResponderIdentification: true });
    expect(await dtoErrors(bp)).toEqual([]);
  });

  it('opção que não é sim/não é erro com o caminho exato', () => {
    const bp = clone() as unknown as { form: Record<string, unknown> };
    bp.form.requireResponderIdentification = 'sim';
    bp.form.showResponderIdentification = 1;
    expect(messages(bp)).toEqual([
      'form.showResponderIdentification: Use true ou false.',
      'form.requireResponderIdentification: Use true ou false.',
    ]);
  });
});
