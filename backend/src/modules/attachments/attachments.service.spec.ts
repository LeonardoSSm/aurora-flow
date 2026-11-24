import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull } from 'typeorm';
import type { AttachmentEntity } from '../../database/entities';
import type { LabelValidatorClientService } from '../integrations/label-validator/label-validator-client.service';
import type { LabelValidationResult } from '../integrations/label-validator/label-validator.types';
import type { StorageService } from '../storage/storage.service';
import {
  AttachmentsService,
  decodeUploadedFileName,
  normalizeAttachmentDescription,
  resolveAttachmentName,
} from './attachments.service';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('content'),
    size: 1024,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeAttachment(overrides: Partial<AttachmentEntity> = {}): AttachmentEntity {
  return {
    id: 'attach-1',
    originalName: 'document.pdf',
    description: null,
    storedName: 'uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storagePath: 'solicitations/sol-1/uuid.pdf',
    storageType: 'local',
    solicitationId: 'sol-1',
    submissionId: null,
    uploadedByUserId: 'user-1',
    isPublic: false,
    createdAt: new Date(),
    solicitation: null,
    submission: null,
    uploadedByUser: null,
    phaseId: null,
    phase: null,
    validationResult: null,
    validatedAt: null,
    ...overrides,
  };
}

function makeLabelValidationResult(overrides: Partial<LabelValidationResult> = {}): LabelValidationResult {
  return {
    aprovada: true,
    lote: { valor: '26/268/01', status: 'OK' },
    fabricacao: { valor: '25/09/2026', status: 'OK' },
    validade: { valor: '06/10/2026', status: 'OK' },
    tipo: 'Frango',
    mensagem: 'Todos os campos presentes e válidos.',
    ...overrides,
  };
}

function makeService(
  repoOverrides: Partial<Record<string, jest.Mock>> = {},
  phaseFieldsRepoOverrides: Partial<Record<string, jest.Mock>> = {},
  phaseFieldValuesRepoOverrides: Partial<Record<string, jest.Mock>> = {},
  solicitationsRepoOverrides: Partial<Record<string, jest.Mock>> = {},
): {
  service: AttachmentsService;
  repo: Record<string, jest.Mock>;
  solicitationsRepo: Record<string, jest.Mock>;
  phaseFieldsRepo: Record<string, jest.Mock>;
  phaseFieldValuesRepo: Record<string, jest.Mock>;
  storageService: StorageService;
  labelValidatorClient: LabelValidatorClientService;
  eventEmitter: EventEmitter2;
} {
  const savedAttachment = makeAttachment();

  const repo = {
    create: jest.fn().mockImplementation((data: unknown) => ({ ...(data as object) })),
    save: jest.fn().mockResolvedValue(savedAttachment),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
    ...repoOverrides,
  };

  const phaseFieldsRepo = {
    find: jest.fn().mockResolvedValue([]),
    ...phaseFieldsRepoOverrides,
  };

  const phaseFieldValuesRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
    ...phaseFieldValuesRepoOverrides,
  };

  const solicitationsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    ...solicitationsRepoOverrides,
  };

  const storageService = {
    validateFile: jest.fn(),
    save: jest.fn().mockResolvedValue({
      storedName: 'uuid.pdf',
      storagePath: 'solicitations/sol-1/uuid.pdf',
      storageType: 'local',
    }),
    delete: jest.fn().mockResolvedValue(undefined),
    getStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
  } as unknown as StorageService;

  const permissionsService = {
    getScope: jest.fn().mockImplementation((role: string) =>
      Promise.resolve(role === 'admin' || role === 'manager' ? 'all' : 'own'),
    ),
  };

  const labelValidatorClient = {
    validateLabel: jest.fn().mockResolvedValue(makeLabelValidationResult()),
  } as unknown as LabelValidatorClientService;

  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;

  const service = new AttachmentsService(
    repo as never,
    phaseFieldsRepo as never,
    phaseFieldValuesRepo as never,
    solicitationsRepo as never,
    storageService,
    permissionsService as never,
    labelValidatorClient,
    eventEmitter,
  );

  return {
    service,
    repo,
    solicitationsRepo,
    phaseFieldsRepo,
    phaseFieldValuesRepo,
    storageService,
    labelValidatorClient,
    eventEmitter,
  };
}

// ─── upload ───────────────────────────────────────────────────────────────────

describe('AttachmentsService.upload', () => {
  it('persists a new AttachmentEntity on success', async () => {
    const { service, repo } = makeService();
    const file = makeFile();
    const result = await service.upload(file, {
      solicitationId: 'sol-1',
      isPublic: false,
      uploadedByUserId: 'user-1',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        solicitationId: 'sol-1',
        isPublic: false,
        uploadedByUserId: 'user-1',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(result.id).toBe('attach-1');
  });

  it('calls storageService.validateFile before saving', async () => {
    const { service, storageService } = makeService();
    await service.upload(makeFile(), { uploadedByUserId: null });
    expect(storageService.validateFile).toHaveBeenCalledTimes(1);
  });

  it('threads phaseId through to the created entity when provided', async () => {
    const { service, repo } = makeService();
    await service.upload(makeFile(), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ phaseId: 'phase-1' }));
  });

  it('defaults phaseId to null when not provided', async () => {
    const { service, repo } = makeService();
    await service.upload(makeFile(), { solicitationId: 'sol-1', uploadedByUserId: 'user-1' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ phaseId: null }));
  });
});

// ─── nome do arquivo ──────────────────────────────────────────────────────────

describe('decodeUploadedFileName', () => {
  const asMulterReadsIt = (name: string) => Buffer.from(name, 'utf8').toString('latin1');

  it('desfaz o UTF-8 lido como Latin-1', () => {
    expect(decodeUploadedFileName(asMulterReadsIt('Comprovante de endereço matrícula.pdf'))).toBe(
      'Comprovante de endereço matrícula.pdf',
    );
  });

  it('não mexe em nome sem acento, já em Unicode ou que não forma UTF-8', () => {
    expect(decodeUploadedFileName('image.jpg')).toBe('image.jpg');
    expect(decodeUploadedFileName('relatório—final.pdf')).toBe('relatório—final.pdf');
    expect(decodeUploadedFileName('SÃO PAULO.pdf')).toBe('SÃO PAULO.pdf');
  });

  it('o upload grava o nome corrigido', async () => {
    const { service, repo } = makeService();
    await service.upload(makeFile({ originalname: asMulterReadsIt('endereço.png') }), { solicitationId: 'sol-1' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ originalName: 'endereço.png' }));
  });
});

// ─── upload → vínculo com a solicitação do envio ──────────────────────────────

describe('AttachmentsService.upload (anexo do formulário público)', () => {
  const submissionAttachment = () =>
    makeAttachment({ solicitationId: null, submissionId: 'sub-1', isPublic: true, uploadedByUserId: null });

  it('vincula o anexo à solicitação do envio quando ela já existe', async () => {
    const { service, repo, solicitationsRepo } = makeService(
      {
        save: jest
          .fn()
          .mockImplementation((entity: AttachmentEntity) => Promise.resolve({ ...submissionAttachment(), ...entity })),
      },
      {},
      {},
      { findOne: jest.fn().mockResolvedValue({ id: 'sol-9' }) },
    );

    const result = await service.upload(makeFile(), { submissionId: 'sub-1', isPublic: true, uploadedByUserId: null });

    expect(solicitationsRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { submissionId: 'sub-1' } }),
    );
    expect(result.solicitationId).toBe('sol-9');
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ solicitationId: 'sol-9' }));
  });

  it('deixa sem solicitação quando ela ainda não foi criada', async () => {
    const { service, repo } = makeService({ save: jest.fn().mockResolvedValue(submissionAttachment()) });

    const result = await service.upload(makeFile(), { submissionId: 'sub-1', isPublic: true, uploadedByUserId: null });

    expect(result.solicitationId).toBeNull();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('não procura solicitação para anexo enviado direto nela', async () => {
    const { service, solicitationsRepo } = makeService();
    await service.upload(makeFile(), { solicitationId: 'sol-1', uploadedByUserId: 'user-1' });
    expect(solicitationsRepo.findOne).not.toHaveBeenCalled();
  });
});

describe('AttachmentsService.linkSubmissionAttachments', () => {
  it('vincula só os anexos do envio que ainda não têm solicitação', async () => {
    const { service, repo } = makeService();
    await service.linkSubmissionAttachments('sub-1', 'sol-9');
    expect(repo.update).toHaveBeenCalledWith(
      { submissionId: 'sub-1', solicitationId: IsNull() },
      { solicitationId: 'sol-9' },
    );
  });
});

// ─── upload → label validation (AI) ────────────────────────────────────────────

describe('AttachmentsService.upload — AI label validation', () => {
  it('does not call the label validator when the phase has no validateLabelWithAi field', async () => {
    const { service, repo, labelValidatorClient } = makeService(undefined, {
      find: jest.fn().mockResolvedValue([
        { id: 'f1', phaseId: 'phase-1', fieldType: 'file_upload', settingsJson: null },
      ]),
    });

    await service.upload(makeFile({ mimetype: 'image/jpeg' }), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });

    expect(labelValidatorClient.validateLabel).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('does not call the label validator for a non-image attachment even if the field is configured', async () => {
    const { service, labelValidatorClient } = makeService(undefined, {
      find: jest.fn().mockResolvedValue([
        { id: 'f1', phaseId: 'phase-1', fieldType: 'file_upload', settingsJson: { validateLabelWithAi: true } },
      ]),
    });

    await service.upload(makeFile({ mimetype: 'application/pdf' }), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });

    expect(labelValidatorClient.validateLabel).not.toHaveBeenCalled();
  });

  it('calls the label validator and persists the verdict when the phase has a configured file_upload field', async () => {
    const result = makeLabelValidationResult({ aprovada: false, mensagem: 'Divergência encontrada.' });
    const { service, repo, labelValidatorClient } = makeService(undefined, {
      find: jest.fn().mockResolvedValue([
        { id: 'f1', phaseId: 'phase-1', fieldType: 'file_upload', settingsJson: { validateLabelWithAi: true } },
      ]),
    });
    (labelValidatorClient.validateLabel as jest.Mock).mockResolvedValue(result);

    await service.upload(makeFile({ mimetype: 'image/jpeg', originalname: 'etiqueta.jpg' }), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });

    expect(labelValidatorClient.validateLabel).toHaveBeenCalledWith(
      expect.any(Buffer),
      'etiqueta.jpg',
      'image/jpeg',
      expect.any(String),
    );
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(repo.save.mock.calls[1][0]).toMatchObject({
      validationResult: result,
      validatedAt: expect.any(Date),
    });
  });

  it('builds the message with lote/fabricacao/validade values already filled in the phase', async () => {
    const { service, phaseFieldValuesRepo, labelValidatorClient } = makeService(
      undefined,
      {
        find: jest.fn().mockResolvedValue([
          { id: 'f1', phaseId: 'phase-1', fieldType: 'file_upload', settingsJson: { validateLabelWithAi: true } },
        ]),
      },
      {
        createQueryBuilder: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            { code: 'lote', valueText: '26/268/01' },
            { code: 'fabricacao', valueText: '25/09/2026' },
            { code: 'validade', valueText: '06/10/2026' },
          ]),
        }),
      },
    );

    await service.upload(makeFile({ mimetype: 'image/jpeg' }), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });

    expect(phaseFieldValuesRepo.createQueryBuilder).toHaveBeenCalled();
    expect(labelValidatorClient.validateLabel).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(String),
      expect.any(String),
      'Analise essa imagem. lote 26/268/01, fab 25/09/2026, val 06/10/2026.',
    );
  });

  it('does not fail the upload when the label validator throws (e.g. not configured)', async () => {
    const { service, repo, labelValidatorClient } = makeService(undefined, {
      find: jest.fn().mockResolvedValue([
        { id: 'f1', phaseId: 'phase-1', fieldType: 'file_upload', settingsJson: { validateLabelWithAi: true } },
      ]),
    });
    (labelValidatorClient.validateLabel as jest.Mock).mockRejectedValue(
      new Error('LABEL_VALIDATOR_API_KEY não está configurado.'),
    );

    const uploaded = await service.upload(makeFile({ mimetype: 'image/jpeg' }), {
      solicitationId: 'sol-1',
      phaseId: 'phase-1',
      uploadedByUserId: 'user-1',
    });

    expect(uploaded).toBeDefined();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});

// ─── findBySolicitation ───────────────────────────────────────────────────────

describe('AttachmentsService.findBySolicitation', () => {
  function makeQueryBuilder() {
    const qb = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    return qb;
  }

  it('filters by phase_id when phaseId is provided', async () => {
    const { service, repo } = makeService();
    const qb = makeQueryBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.findBySolicitation('sol-1', false, 'user-1', 'phase-1');

    expect(qb.andWhere).toHaveBeenCalledWith('a.phase_id = :phaseId', { phaseId: 'phase-1' });
  });

  it('does not apply a phase filter when phaseId is omitted', async () => {
    const { service, repo } = makeService();
    const qb = makeQueryBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.findBySolicitation('sol-1', false, 'user-1');

    expect(qb.andWhere).not.toHaveBeenCalledWith('a.phase_id = :phaseId', expect.anything());
  });

  it('sem "ver todos": só os públicos e os que a pessoa enviou', async () => {
    const { service, repo } = makeService();
    const qb = makeQueryBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.findBySolicitation('sol-1', false, 'user-1');
    expect(qb.andWhere).toHaveBeenCalledWith('(a.is_public = true OR a.uploaded_by_user_id = :actorId)', {
      actorId: 'user-1',
    });

    const all = makeQueryBuilder();
    repo.createQueryBuilder.mockReturnValue(all);
    await service.findBySolicitation('sol-1', true, 'user-1');
    expect(all.andWhere).not.toHaveBeenCalled();
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe('AttachmentsService.delete', () => {
  // A rota confere o processo do anexo e diz se a pessoa pode excluir o de todos.
  const canManageAll = (value: boolean) => jest.fn().mockResolvedValue(value);

  it('removes file and record when actor is the uploader', async () => {
    const attachment = makeAttachment({ uploadedByUserId: 'user-1' });
    const { service, repo, storageService } = makeService({
      findOne: jest.fn().mockResolvedValue(attachment),
    });

    await service.delete('attach-1', 'user-1', canManageAll(false));

    expect(storageService.delete).toHaveBeenCalledWith(attachment.storagePath);
    expect(repo.remove).toHaveBeenCalledWith(attachment);
  });

  it('quem tem "ver e excluir anexos de todos" no processo exclui o de outra pessoa', async () => {
    const attachment = makeAttachment({ uploadedByUserId: 'other-user' });
    const { service, storageService } = makeService({
      findOne: jest.fn().mockResolvedValue(attachment),
    });

    await expect(service.delete('attach-1', 'admin-id', canManageAll(true))).resolves.not.toThrow();
    expect(storageService.delete).toHaveBeenCalled();
  });

  it('throws ForbiddenException when editor tries to delete someone else\'s attachment', async () => {
    const attachment = makeAttachment({ uploadedByUserId: 'other-user' });
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue(attachment),
    });

    await expect(service.delete('attach-1', 'my-user', canManageAll(false))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for a missing attachment', async () => {
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.delete('no-id', 'user-1', canManageAll(true))).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── download ─────────────────────────────────────────────────────────────────

describe('AttachmentsService.download', () => {
  it('allows download of a public attachment via public route', async () => {
    const attachment = makeAttachment({ isPublic: true });
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(attachment) });

    await expect(service.download('attach-1', { isPublicRoute: true })).resolves.toMatchObject({
      attachment,
    });
  });

  it('throws ForbiddenException when isPublic=false is accessed via public route', async () => {
    const attachment = makeAttachment({ isPublic: false });
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(attachment) });

    await expect(service.download('attach-1', { isPublicRoute: true })).rejects.toThrow(
      ForbiddenException,
    );
  });
});

// ─── nome e descrição escolhidos por quem envia ────────────────────────────────

describe('resolveAttachmentName', () => {
  it('mantém a extensão do arquivo ao renomear', () => {
    expect(resolveAttachmentName('IMG_2041.jpg', 'Etiqueta lote 12')).toBe('Etiqueta lote 12.jpg');
  });

  it('não duplica a extensão quando a pessoa já a digitou (sem diferenciar maiúsculas)', () => {
    expect(resolveAttachmentName('scan.PDF', 'Nota fiscal.pdf')).toBe('Nota fiscal.PDF');
    expect(resolveAttachmentName('scan.pdf', 'Nota fiscal.pdf')).toBe('Nota fiscal.pdf');
  });

  it('vazio, só espaços ou só caracteres proibidos = nome atual', () => {
    expect(resolveAttachmentName('a.pdf', '')).toBe('a.pdf');
    expect(resolveAttachmentName('a.pdf', '   ')).toBe('a.pdf');
    expect(resolveAttachmentName('a.pdf', '///')).toBe('a.pdf');
    expect(resolveAttachmentName('a.pdf', undefined)).toBe('a.pdf');
  });

  it('tira barras, dois-pontos, controle e pontos do começo (nada de caminho)', () => {
    expect(resolveAttachmentName('a.pdf', '../../etc/passwd')).toBe('etc passwd.pdf');
    expect(resolveAttachmentName('a.pdf', 'C:\\temp\\x\u0000y')).toBe('C temp x y.pdf');
  });

  it('corta nomes longos sem perder a extensão', () => {
    const result = resolveAttachmentName('a.jpeg', 'x'.repeat(500));
    expect(result.length).toBe(200);
    expect(result.endsWith('.jpeg')).toBe(true);
  });

  it('arquivo sem extensão fica sem extensão', () => {
    expect(resolveAttachmentName('LEIAME', 'Instruções')).toBe('Instruções');
  });
});

describe('normalizeAttachmentDescription', () => {
  it('apara, corta em 1000 e vazio vira null', () => {
    expect(normalizeAttachmentDescription('  Comprovante do frete  ')).toBe('Comprovante do frete');
    expect(normalizeAttachmentDescription('   ')).toBeNull();
    expect(normalizeAttachmentDescription(null)).toBeNull();
    expect(normalizeAttachmentDescription('a'.repeat(1500))).toHaveLength(1000);
  });
});

describe('AttachmentsService.upload — nome e descrição', () => {
  it('grava o nome escolhido (com a extensão original) e a descrição', async () => {
    const { service, repo } = makeService();
    await service.upload(makeFile({ originalname: 'scan001.pdf' }), {
      solicitationId: 'sol-1',
      name: 'Contrato assinado',
      description: '  Versão final, com as duas assinaturas ',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: 'Contrato assinado.pdf',
        description: 'Versão final, com as duas assinaturas',
      }),
    );
  });

  it('sem nome nem descrição, fica como sempre foi', async () => {
    const { service, repo } = makeService();
    await service.upload(makeFile(), { solicitationId: 'sol-1' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: 'document.pdf', description: null }),
    );
  });
});

describe('AttachmentsService.update', () => {
  it('quem enviou renomeia e descreve; o arquivo em disco não muda', async () => {
    const attachment = makeAttachment({ uploadedByUserId: 'user-1', originalName: 'IMG_1.jpg', storagePath: 'x/uuid.jpg' });
    const { service, repo, storageService } = makeService({
      findOne: jest.fn().mockResolvedValue(attachment),
      save: jest.fn().mockImplementation((a: unknown) => Promise.resolve(a)),
    });
    const result = await service.update('attach-1', { name: 'Foto da avaria', description: 'Lateral' }, 'user-1', async () => false);
    expect(result.originalName).toBe('Foto da avaria.jpg');
    expect(result.description).toBe('Lateral');
    expect(result.storagePath).toBe('x/uuid.jpg');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(storageService.save).not.toHaveBeenCalled();
  });

  it('descrição vazia apaga; nome ausente não mexe no nome', async () => {
    const attachment = makeAttachment({ uploadedByUserId: 'user-1', originalName: 'a.pdf', description: 'velha' });
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue(attachment),
      save: jest.fn().mockImplementation((a: unknown) => Promise.resolve(a)),
    });
    const result = await service.update('attach-1', { description: '' }, 'user-1', async () => false);
    expect(result.originalName).toBe('a.pdf');
    expect(result.description).toBeNull();
  });

  it('outra pessoa sem "anexos de todos" não altera', async () => {
    const { service, repo } = makeService({
      findOne: jest.fn().mockResolvedValue(makeAttachment({ uploadedByUserId: 'user-1' })),
    });
    await expect(service.update('attach-1', { name: 'x' }, 'user-2', async () => false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('com "anexos de todos" altera o de outra pessoa (inclusive o do formulário público)', async () => {
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue(makeAttachment({ uploadedByUserId: null, originalName: 'f.png' })),
      save: jest.fn().mockImplementation((a: unknown) => Promise.resolve(a)),
    });
    const result = await service.update('attach-1', { name: 'Comprovante' }, 'user-2', async () => true);
    expect(result.originalName).toBe('Comprovante.png');
  });

  it('anexo inexistente = 404', async () => {
    const { service } = makeService();
    await expect(service.update('nope', { name: 'x' }, 'user-1', async () => true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
