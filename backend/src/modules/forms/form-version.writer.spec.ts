import type { EntityManager } from 'typeorm';
import { FormVersionWriter } from './form-version.writer';
import type { FormVersionEntity } from '../../database/entities';
import type { CreateFormDto, CreateFormSectionDto } from './dto/create-form.dto';

/**
 * O escritor de versão do formulário.
 *
 * O que estes testes protegem, em ordem de importância: que mover uma seção
 * no canvas do fluxo não cria versão nova (não é mudança de estrutura), que
 * essa posição ainda assim é gravada — o bug que motivou a coluna existir —,
 * que uma mudança de estrutura de verdade continua criando/substituindo
 * versão como sempre criou, e que o mesmo raciocínio vale pras configurações
 * da versão (modo do formulário, identificação opcional): também não são
 * estrutura, também precisam persistir sozinhas sem criar versão nova.
 */

function fazerSecaoDto(over: Partial<CreateFormSectionDto> = {}): CreateFormSectionDto {
  return {
    title: 'Seção única',
    description: undefined,
    nextSectionIndex: null,
    flowPositionX: null,
    flowPositionY: null,
    branches: [],
    fields: [
      {
        code: 'nome',
        label: 'Nome',
        fieldType: 'short_text',
        required: true,
      } as CreateFormSectionDto['fields'][number],
    ],
    ...over,
  } as CreateFormSectionDto;
}

function fazerDto(secoes: CreateFormSectionDto[]): CreateFormDto {
  return {
    name: 'Formulário de teste',
    description: undefined,
    sections: secoes,
  } as CreateFormDto;
}

/** Seção já salva, com o mesmo conteúdo estrutural que `fazerSecaoDto` produz. */
function fazerSecaoEntity(over: Record<string, unknown> = {}) {
  return {
    id: 'secao-id',
    order: 1,
    title: 'Seção única',
    description: null,
    nextSectionId: null,
    nextIsSubmit: true,
    flowPositionX: null,
    flowPositionY: null,
    fields: [
      {
        id: 'campo-id',
        code: 'nome',
        label: 'Nome',
        fieldType: 'short_text',
        order: 1,
        required: true,
        isSensitive: false,
        settingsJson: {},
        conditionsJson: {},
        visibilityRules: null,
        options: [],
      },
    ],
    branches: [],
    ...over,
  };
}

function makeManager(latestVersion: unknown) {
  const salvos: unknown[] = [];
  const deletados: unknown[] = [];
  const manager = {
    create: jest.fn((_entidade: unknown, dados: unknown) => ({ ...(dados as object) })),
    save: jest.fn(async (dados: unknown) => {
      const comId = { id: dados && (dados as { id?: string }).id ? (dados as { id: string }).id : `novo_${salvos.length}`, ...(dados as object) };
      salvos.push(comId);
      return comId;
    }),
    findOne: jest.fn().mockResolvedValue(latestVersion),
    delete: jest.fn(async (_entidade: unknown, criterio: unknown) => {
      deletados.push(criterio);
    }),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntityManager;
  return { manager, salvos, deletados };
}

function fazerFormEntity(versaoId: string, versionNumber = 1) {
  return {
    id: 'form-id',
    versions: [{ id: versaoId, versionNumber }],
  } as unknown as Parameters<FormVersionWriter['applyVersionUpdate']>[1];
}

describe('FormVersionWriter — posição no canvas não é estrutura', () => {
  it('mover uma seção (só a posição muda) não cria versão nova', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [fazerSecaoEntity()],
    } as unknown as FormVersionEntity;
    const { manager, deletados } = makeManager(versaoSalva);

    const dtoComNovaPosicao = fazerDto([fazerSecaoDto({ flowPositionX: 240, flowPositionY: 80 })]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dtoComNovaPosicao);

    // Nada de deletar a versão nem criar outra — create() só é chamado se uma
    // versão nova estiver sendo montada.
    expect(deletados).toHaveLength(0);
    const criouSecaoNova = (manager.create as jest.Mock).mock.calls.some(
      (chamada) => chamada[1]?.title === 'Seção única' && chamada[1]?.order === 1,
    );
    expect(criouSecaoNova).toBe(false);
  });

  it('a posição nova de fato é gravada — o bug que motivou a coluna', async () => {
    const writer = new FormVersionWriter();
    const secaoEntity = fazerSecaoEntity();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [secaoEntity],
    } as unknown as FormVersionEntity;
    const { manager, salvos } = makeManager(versaoSalva);

    const dto = fazerDto([fazerSecaoDto({ flowPositionX: 240, flowPositionY: 80 })]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({ id: 'secao-id', flowPositionX: 240, flowPositionY: 80 });
  });

  it('sem mudar a posição, não grava nada — não fica reescrevendo à toa', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [fazerSecaoEntity({ flowPositionX: 100, flowPositionY: 50 })],
    } as unknown as FormVersionEntity;
    const { manager, salvos } = makeManager(versaoSalva);

    const dto = fazerDto([fazerSecaoDto({ flowPositionX: 100, flowPositionY: 50 })]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(salvos).toHaveLength(0);
  });

  it('duas seções: só a que moveu é gravada', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 1,
      isPublished: false,
      sections: [
        fazerSecaoEntity({ id: 'a', order: 1, title: 'A', fields: [] }),
        fazerSecaoEntity({ id: 'b', order: 2, title: 'B', fields: [] }),
      ],
    } as unknown as FormVersionEntity;
    const { manager, salvos } = makeManager(versaoSalva);

    const dto = fazerDto([
      fazerSecaoDto({ title: 'A', fields: [], flowPositionX: null, flowPositionY: null }),
      fazerSecaoDto({ title: 'B', fields: [], flowPositionX: 300, flowPositionY: 200 }),
    ]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 1), dto);

    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({ id: 'b', flowPositionX: 300, flowPositionY: 200 });
  });

  it('mudança de estrutura de verdade (novo campo) continua criando versão — não é mascarada pela posição', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [fazerSecaoEntity()],
    } as unknown as FormVersionEntity;
    const { manager, deletados } = makeManager(versaoSalva);

    const dto = fazerDto([
      fazerSecaoDto({
        flowPositionX: 240,
        flowPositionY: 80,
        fields: [
          { code: 'nome', label: 'Nome', fieldType: 'short_text', required: true },
          { code: 'novo', label: 'Novo campo', fieldType: 'short_text', required: false },
        ] as CreateFormSectionDto['fields'],
      }),
    ]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    // Rascunho não publicado: substitui no lugar (deleta a antiga, cria outra).
    expect(deletados).toHaveLength(1);
  });

  it('formulário publicado com estrutura mudada gera versão nova, não sobrescreve a publicada', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: true,
      sections: [fazerSecaoEntity()],
    } as unknown as FormVersionEntity;
    const { manager, deletados, salvos } = makeManager(versaoSalva);

    const dto = fazerDto([
      fazerSecaoDto({
        fields: [
          { code: 'nome', label: 'Nome', fieldType: 'short_text', required: true },
          { code: 'novo', label: 'Novo campo', fieldType: 'short_text', required: false },
        ] as CreateFormSectionDto['fields'],
      }),
    ]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(deletados).toHaveLength(0);
    const versaoCriada = salvos.find((s) => (s as { versionNumber?: number }).versionNumber === 4);
    expect(versaoCriada).toBeDefined();
  });
});

describe('FormVersionWriter — hash de estrutura não depende da ordem das chaves do jsonb', () => {
  // O Postgres jsonb não preserva a ordem das chaves que recebeu — reordena
  // por tamanho e depois alfabeticamente. Um settingsJson salvo e lido de
  // volta chega com as chaves nessa ordem canônica do banco, nunca na ordem
  // que o front original mandou. Comparar por JSON.stringify cru (sensível a
  // ordem) fazia TODO salvamento recriar a versão inteira, mesmo sem nenhuma
  // mudança real — este é exatamente o caso real que expôs o bug: um campo de
  // upload com três chaves em settingsJson.
  const SETTINGS_COMO_O_FRONT_MANDA = {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeInBytes: 10485760,
    maxFiles: 1,
  };
  // A mesma configuração, na ordem que o Postgres devolve de um jsonb real
  // (confirmada rodando SELECT $1::jsonb contra o banco) — não é uma ordem
  // arbitrária escolhida para o teste passar.
  const SETTINGS_COMO_O_JSONB_DEVOLVE = {
    maxFiles: 1,
    maxSizeInBytes: 10485760,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  };

  it('settingsJson com as mesmas chaves em ordem diferente não recria a versão', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [
        fazerSecaoEntity({
          fields: [
            {
              id: 'campo-upload',
              code: 'anexo',
              label: 'Anexo',
              fieldType: 'file_upload',
              order: 1,
              required: false,
              isSensitive: false,
              settingsJson: SETTINGS_COMO_O_JSONB_DEVOLVE,
              conditionsJson: {},
              visibilityRules: null,
              options: [],
            },
          ],
        }),
      ],
    } as unknown as FormVersionEntity;
    const { manager, deletados, salvos } = makeManager(versaoSalva);

    const dto = fazerDto([
      fazerSecaoDto({
        fields: [
          {
            code: 'anexo',
            label: 'Anexo',
            fieldType: 'file_upload',
            required: false,
            settingsJson: SETTINGS_COMO_O_FRONT_MANDA,
          },
        ] as CreateFormSectionDto['fields'],
      }),
    ]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(deletados).toHaveLength(0);
    expect(salvos).toHaveLength(0);
  });

  it('mudar de fato um valor dentro do settingsJson ainda é detectado como mudança', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      sections: [
        fazerSecaoEntity({
          fields: [
            {
              id: 'campo-upload',
              code: 'anexo',
              label: 'Anexo',
              fieldType: 'file_upload',
              order: 1,
              required: false,
              isSensitive: false,
              settingsJson: SETTINGS_COMO_O_JSONB_DEVOLVE,
              conditionsJson: {},
              visibilityRules: null,
              options: [],
            },
          ],
        }),
      ],
    } as unknown as FormVersionEntity;
    const { manager, deletados } = makeManager(versaoSalva);

    const dto = fazerDto([
      fazerSecaoDto({
        fields: [
          {
            code: 'anexo',
            label: 'Anexo',
            fieldType: 'file_upload',
            required: false,
            // maxFiles mudou de 1 para 2 — mudança real, precisa recriar.
            settingsJson: { ...SETTINGS_COMO_O_FRONT_MANDA, maxFiles: 2 },
          },
        ] as CreateFormSectionDto['fields'],
      }),
    ]);
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(deletados).toHaveLength(1);
  });
});

describe('FormVersionWriter — criação grava a posição inicial', () => {
  it('createVersionFromDto grava flowPositionX/Y em cada seção', async () => {
    const writer = new FormVersionWriter();
    const { manager, salvos } = makeManager(null);

    const dto = fazerDto([fazerSecaoDto({ flowPositionX: 10, flowPositionY: 20 })]);
    await writer.createVersionFromDto(manager, 'form-id', 1, dto);

    const secaoSalva = salvos.find((s) => (s as { title?: string }).title === 'Seção única');
    expect(secaoSalva).toMatchObject({ flowPositionX: 10, flowPositionY: 20 });
  });

  it('sem posição informada, grava nula — não inventa coordenada', async () => {
    const writer = new FormVersionWriter();
    const { manager, salvos } = makeManager(null);

    const dto = fazerDto([fazerSecaoDto()]);
    await writer.createVersionFromDto(manager, 'form-id', 1, dto);

    const secaoSalva = salvos.find((s) => (s as { title?: string }).title === 'Seção única');
    expect(secaoSalva).toMatchObject({ flowPositionX: null, flowPositionY: null });
  });
});

describe('FormVersionWriter — configurações da versão (modo, identificação opcional)', () => {
  it('createVersionFromDto grava o settingsJson recebido, em vez do padrão fixo', async () => {
    const writer = new FormVersionWriter();
    const { manager, salvos } = makeManager(null);

    const dto = {
      ...fazerDto([fazerSecaoDto()]),
      settingsJson: { mode: 'stepper', showResponderIdentification: false },
    } as CreateFormDto;
    await writer.createVersionFromDto(manager, 'form-id', 1, dto);

    const versaoSalva = salvos.find((s) => (s as { versionNumber?: number }).versionNumber === 1);
    expect(versaoSalva).toMatchObject({
      settingsJson: { mode: 'stepper', showResponderIdentification: false },
    });
  });

  it('createVersionFromDto sem settingsJson no DTO cai no padrão { mode: "single" }', async () => {
    const writer = new FormVersionWriter();
    const { manager, salvos } = makeManager(null);

    const dto = fazerDto([fazerSecaoDto()]);
    await writer.createVersionFromDto(manager, 'form-id', 1, dto);

    const versaoSalva = salvos.find((s) => (s as { versionNumber?: number }).versionNumber === 1);
    expect(versaoSalva).toMatchObject({ settingsJson: { mode: 'single' } });
  });

  it('trocar só a configuração (sem mexer em campo/seção) grava sem criar versão nova', async () => {
    // Mesmo raciocínio de mover uma seção no canvas: settingsJson fica fora do hash de
    // estrutura de propósito, então esse é o único jeito de uma troca de configuração
    // sozinha realmente persistir.
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      settingsJson: { mode: 'single', showResponderIdentification: true },
      sections: [fazerSecaoEntity()],
    } as unknown as FormVersionEntity;
    const { manager, salvos, deletados } = makeManager(versaoSalva);

    const dto = {
      ...fazerDto([fazerSecaoDto()]),
      settingsJson: { mode: 'single', showResponderIdentification: false },
    } as CreateFormDto;
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(deletados).toHaveLength(0);
    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({
      id: 'versao-id',
      settingsJson: { mode: 'single', showResponderIdentification: false },
    });
  });

  it('configuração efetivamente igual (mesmo com chaves em ordem diferente) não grava nada', async () => {
    const writer = new FormVersionWriter();
    const versaoSalva = {
      id: 'versao-id',
      versionNumber: 3,
      isPublished: false,
      settingsJson: { showResponderIdentification: false, mode: 'single' },
      sections: [fazerSecaoEntity()],
    } as unknown as FormVersionEntity;
    const { manager, salvos } = makeManager(versaoSalva);

    const dto = {
      ...fazerDto([fazerSecaoDto()]),
      settingsJson: { mode: 'single', showResponderIdentification: false },
    } as CreateFormDto;
    await writer.applyVersionUpdate(manager, fazerFormEntity('versao-id', 3), dto);

    expect(salvos).toHaveLength(0);
  });
});
