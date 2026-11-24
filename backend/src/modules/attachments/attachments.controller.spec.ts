import { ForbiddenException } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { AttachmentEntity } from '../../database/entities';
import { AttachmentsController, PublicAttachmentsController } from './attachments.controller';
import type { AttachmentsService } from './attachments.service';

function makeAttachment(overrides: Partial<AttachmentEntity> = {}): AttachmentEntity {
  return {
    id: 'attach-1',
    originalName: 'report.pdf',
    description: null,
    storedName: 'uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storagePath: 'submissions/sub-1/uuid.pdf',
    storageType: 'local',
    solicitationId: null,
    submissionId: 'sub-1',
    uploadedByUserId: null,
    isPublic: true,
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

function makeFile(): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'report.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('data'),
    size: 4,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

function makeRes(overrides: Record<string, unknown> = {}): jest.Mocked<Response> {
  const res = {
    setHeader: jest.fn(),
    pipe: jest.fn(),
    headersSent: false,
    destroy: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  } as unknown as jest.Mocked<Response>;
  return res;
}

function makeStream(pipe: jest.Mock = jest.fn()): EventEmitter & { pipe: jest.Mock } {
  const stream = new EventEmitter() as EventEmitter & { pipe: jest.Mock };
  stream.pipe = pipe;
  return stream;
}

// ─── PublicAttachmentsController ─────────────────────────────────────────────

describe('PublicAttachmentsController', () => {
  function makePublicController(serviceOverrides: Partial<AttachmentsService> = {}): { controller: PublicAttachmentsController; service: AttachmentsService } {
    const service = {
      upload: jest.fn().mockResolvedValue(makeAttachment()),
      download: jest.fn().mockResolvedValue({
        attachment: makeAttachment(),
        stream: makeStream(),
      }),
      ...serviceOverrides,
    } as unknown as AttachmentsService;

    return { controller: new PublicAttachmentsController(service), service };
  }

  it('POST /public/submissions/:id/attachments — sem autenticação retorna 201', async () => {
    const { controller } = makePublicController();
    const result = await controller.uploadToSubmission('sub-1', makeFile(), {});
    expect(result.id).toBe('attach-1');
  });

  it('POST /public/submissions/:id/attachments — repassa nome e descrição do arquivo', async () => {
    const { controller, service } = makePublicController();
    await controller.uploadToSubmission('sub-1', makeFile(), { name: 'RG frente', description: 'Documento do motorista' });
    expect(service.upload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ submissionId: 'sub-1', isPublic: true, name: 'RG frente', description: 'Documento do motorista' }),
    );
  });

  it('GET /public/attachments/:id/download — isPublic=true responde com stream', async () => {
    const pipeMock = jest.fn();
    const { controller } = makePublicController({
      download: jest.fn().mockResolvedValue({
        attachment: makeAttachment({ isPublic: true }),
        stream: makeStream(pipeMock),
      }),
    });

    const res = makeRes();
    await controller.download('attach-1', res as never);
    expect(pipeMock).toHaveBeenCalledWith(res);
  });

  it('GET /public/attachments/:id/download — arquivo ausente no disco responde 404 em vez de travar', async () => {
    const stream = makeStream();
    const { controller } = makePublicController({
      download: jest.fn().mockResolvedValue({
        attachment: makeAttachment({ isPublic: true }),
        stream,
      }),
    });

    const res = makeRes();
    await controller.download('attach-1', res as never);
    stream.emit('error', new Error('ENOENT: no such file or directory'));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('não encontrado') }),
    );
  });

  it('GET /public/attachments/:id/download — isPublic=false lança ForbiddenException', async () => {
    const { controller } = makePublicController({
      download: jest.fn().mockRejectedValue(new ForbiddenException()),
    });

    const res = makeRes();
    await expect(controller.download('attach-1', res as never)).rejects.toThrow(ForbiddenException);
  });
});

// ─── AttachmentsController (autenticado) ─────────────────────────────────────

describe('AttachmentsController', () => {
  const currentUser = {
    sub: 'user-1',
    role: 'editor',
    email: 'user@test.com',
    fullName: 'Test',
    tokenVersion: 0,
    areaId: null,
  };

  function makeAuthController(
    serviceOverrides: Partial<AttachmentsService> = {},
    accessOverrides: Record<string, jest.Mock> = {},
  ): { controller: AttachmentsController; service: AttachmentsService; access: Record<string, jest.Mock> } {
    const access = {
      assertSolicitationAccess: jest.fn().mockResolvedValue({}),
      assertSolicitationReadable: jest.fn().mockResolvedValue({}),
      assertSubmissionAccess: jest.fn().mockResolvedValue({}),
      assertAttachmentReadable: jest.fn().mockResolvedValue(undefined),
      ...accessOverrides,
    };
    const service = {
      upload: jest.fn().mockResolvedValue(makeAttachment()),
      findBySolicitation: jest.fn().mockResolvedValue([]),
      download: jest.fn().mockResolvedValue({
        attachment: makeAttachment(),
        stream: makeStream(),
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      ...serviceOverrides,
    } as unknown as AttachmentsService;

    return { controller: new AttachmentsController(service, access as never), service, access };
  }

  it('POST /solicitations/:id/attachments — chama upload com solicitationId', async () => {
    const { controller, service } = makeAuthController();
    await controller.uploadToSolicitation('sol-1', makeFile(), {}, currentUser as never);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'report.pdf' }),
      expect.objectContaining({ solicitationId: 'sol-1', uploadedByUserId: 'user-1' }),
    );
  });

  it('GET /submissions/:id/attachments — lista os arquivos da resposta', async () => {
    const attachment = makeAttachment();
    const { controller, service } = makeAuthController({
      findBySubmission: jest.fn().mockResolvedValue([attachment]),
    });
    await expect(controller.findBySubmission('sub-1', currentUser as never)).resolves.toEqual([attachment]);
    expect(service.findBySubmission).toHaveBeenCalledWith('sub-1');
  });

  it('POST /solicitations/:id/attachments — repassa nome e descrição do multipart', async () => {
    const { controller, service } = makeAuthController();
    await controller.uploadToSolicitation(
      'sol-1',
      makeFile(),
      { name: 'Contrato', description: 'Assinado' },
      currentUser as never,
    );
    expect(service.upload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Contrato', description: 'Assinado' }),
    );
  });

  it('PATCH /attachments/:id — confere o processo e delega para service.update', async () => {
    const found = makeAttachment({ solicitationId: 'sol-1' });
    const update = jest.fn().mockImplementation(
      async (_id: string, _dto: unknown, _actor: string, authorize: (a: unknown) => Promise<boolean>) => {
        await authorize(found);
        return found;
      },
    );
    const canOnSolicitation = jest.fn().mockResolvedValue(true);
    const { controller, access } = makeAuthController({ update } as never, { canOnSolicitation });
    await controller.update('attach-1', { name: 'Novo' }, currentUser as never);
    expect(update).toHaveBeenCalledWith('attach-1', { name: 'Novo' }, 'user-1', expect.any(Function));
    expect(access.assertAttachmentReadable).toHaveBeenCalledWith(found, currentUser);
    expect(canOnSolicitation).toHaveBeenCalledWith('sol-1', currentUser, 'attachments.manage_all');
  });

  it('DELETE /attachments/:id — delega para service.delete', async () => {
    const { controller, service } = makeAuthController();
    await controller.delete('attach-1', currentUser as never);
    expect(service.delete).toHaveBeenCalledWith('attach-1', 'user-1', expect.any(Function));
  });

  it('GET /attachments/:id/download — responde com stream do arquivo', async () => {
    const pipeMock = jest.fn();
    const { controller } = makeAuthController({
      download: jest.fn().mockResolvedValue({
        attachment: makeAttachment({ mimeType: 'image/jpeg', originalName: 'foto.jpg' }),
        stream: makeStream(pipeMock),
      }),
    });

    const res = makeRes();
    await controller.download('attach-1', currentUser as never, res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(pipeMock).toHaveBeenCalledWith(res);
  });

  it('GET /attachments/:id/download — arquivo ausente no disco responde 404 em vez de travar a requisição', async () => {
    const stream = makeStream();
    const { controller } = makeAuthController({
      download: jest.fn().mockResolvedValue({ attachment: makeAttachment(), stream }),
    });

    const res = makeRes();
    await controller.download('attach-1', currentUser as never, res as never);
    stream.emit('error', new Error('ENOENT: no such file or directory'));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('não encontrado') }),
    );
    expect(res.destroy).not.toHaveBeenCalled();
  });

  it('GET /attachments/:id/download — erro depois de já ter começado a enviar derruba a conexão sem tentar JSON', async () => {
    const stream = makeStream();
    const { controller } = makeAuthController({
      download: jest.fn().mockResolvedValue({ attachment: makeAttachment(), stream }),
    });

    const res = makeRes({ headersSent: true });
    await controller.download('attach-1', currentUser as never, res as never);
    stream.emit('error', new Error('EIO: i/o error'));

    expect(res.destroy).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── Anexos conferem o processo ──────────────────────────────────────────────

describe('AttachmentsController — processo do anexo', () => {
  const currentUser = {
    sub: 'user-1',
    role: 'editor',
    email: 'user@test.com',
    fullName: 'Test',
    tokenVersion: 0,
    areaId: null,
  };
  const denied = (): jest.Mock => jest.fn().mockRejectedValue(new ForbiddenException('Acesso negado.'));

  function make(access: Record<string, jest.Mock>, serviceOverrides: Record<string, jest.Mock> = {}) {
    const service = {
      upload: jest.fn(),
      findBySolicitation: jest.fn(),
      findBySubmission: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
      ...serviceOverrides,
    };
    return { controller: new AttachmentsController(service as never, access as never), service };
  }

  it('enviar para um card que a pessoa não vê: 403 e nada é gravado', async () => {
    const { controller, service } = make({ assertSolicitationAccess: denied() });
    await expect(
      controller.uploadToSolicitation('sol-b', makeFile(), {}, currentUser as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it('listar anexos de um card que a pessoa não vê: 403', async () => {
    const { controller, service } = make({ assertSolicitationReadable: denied() });
    await expect(
      controller.findBySolicitation('sol-b', undefined, currentUser as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.findBySolicitation).not.toHaveBeenCalled();
  });

  it('listar anexos sendo chamado a aprovar no card: vê todos, mesmo sem "anexos de todos"', async () => {
    const { controller, service } = make({
      assertSolicitationReadable: jest.fn().mockResolvedValue({}),
      canOnSolicitation: jest.fn().mockResolvedValue(false),
      isApproverOfSolicitation: jest.fn().mockResolvedValue(true),
    });
    await controller.findBySolicitation('sol-a', undefined, currentUser as never);
    expect(service.findBySolicitation).toHaveBeenCalledWith('sol-a', true, 'user-1', undefined);
  });

  it('listar anexos sem "anexos de todos" e sem ser aprovador: só os públicos e os próprios', async () => {
    const { controller, service } = make({
      assertSolicitationReadable: jest.fn().mockResolvedValue({}),
      canOnSolicitation: jest.fn().mockResolvedValue(false),
      isApproverOfSolicitation: jest.fn().mockResolvedValue(false),
    });
    await controller.findBySolicitation('sol-a', 'phase-1', currentUser as never);
    expect(service.findBySolicitation).toHaveBeenCalledWith('sol-a', false, 'user-1', 'phase-1');
  });

  it('listar anexos de uma resposta de outro processo: 403', async () => {
    const { controller, service } = make({ assertSubmissionAccess: denied() });
    await expect(controller.findBySubmission('sub-b', currentUser as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.findBySubmission).not.toHaveBeenCalled();
  });

  it('baixar: a conferência do anexo vai para o serviço, que a roda antes de abrir o arquivo', async () => {
    const attachment = makeAttachment({ solicitationId: 'sol-b', isPublic: false });
    const assertAttachmentReadable = denied();
    const { controller } = make(
      { assertAttachmentReadable },
      {
        download: jest.fn().mockImplementation(
          async (_id: string, opts: { authorize: (a: AttachmentEntity) => Promise<void> }) => {
            await opts.authorize(attachment);
            return { attachment, stream: makeStream() };
          },
        ),
      },
    );
    await expect(
      controller.download('attach-1', currentUser as never, makeRes() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertAttachmentReadable).toHaveBeenCalledWith(attachment, currentUser);
  });
});
