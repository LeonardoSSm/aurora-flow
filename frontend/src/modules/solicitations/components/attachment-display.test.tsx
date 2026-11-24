import { AxiosError, AxiosHeaders } from 'axios';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { Attachment } from '../types';
import { AttachmentPreview, MISSING_FILE_NOTICE } from './attachment-display';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ api: { get: mocks.get } }));

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    originalName: 'comprovante.pdf',
    storedName: 'x.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    storageType: 'local',
    solicitationId: 'sol-1',
    submissionId: 'sub-1',
    uploadedByUserId: null,
    uploadedByUser: null,
    isPublic: true,
    phaseId: null,
    validationResult: null,
    validatedAt: null,
    createdAt: '2026-09-29T12:00:00Z',
    ...overrides,
  } as Attachment;
}

function notFound(): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config: { headers },
    data: null,
  });
}

describe('AttachmentPreview — arquivo que não está mais no servidor', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('avisa ao clicar em baixar e tira o botão', async () => {
    mocks.get.mockImplementation(() => Promise.reject(notFound()));
    render(<AttachmentPreview attachment={attachment()} />);

    fireEvent.click(screen.getByTitle('Baixar'));

    expect(await screen.findByText(MISSING_FILE_NOTICE)).toBeInTheDocument();
    expect(screen.queryByTitle('Baixar')).not.toBeInTheDocument();
  });

  it('avisa direto na imagem cuja prévia não carrega', async () => {
    mocks.get.mockImplementation(() => Promise.reject(notFound()));
    render(<AttachmentPreview attachment={attachment({ originalName: 'image.jpg', mimeType: 'image/jpeg' })} />);

    expect(await screen.findByText(MISSING_FILE_NOTICE)).toBeInTheDocument();
  });

  it('outro erro só pede para tentar de novo', async () => {
    mocks.get.mockImplementation(() => Promise.reject(new Error('rede')));
    render(<AttachmentPreview attachment={attachment()} />);

    fireEvent.click(screen.getByTitle('Baixar'));

    expect(await screen.findByText('Não foi possível baixar. Tente de novo.')).toBeInTheDocument();
    expect(screen.getByTitle('Baixar')).toBeInTheDocument();
  });
});

describe('AttachmentPreview — visualizar sem baixar', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:anexo');
    URL.revokeObjectURL = vi.fn();
  });

  it('abre o PDF numa janela por cima da tela', async () => {
    mocks.get.mockImplementation(() => Promise.resolve({ data: new Blob(['%PDF']) }));
    render(<AttachmentPreview attachment={attachment()} />);

    fireEvent.click(screen.getByTitle('Visualizar'));

    const dialog = await screen.findByRole('dialog', { name: 'comprovante.pdf' });
    expect(await within(dialog).findByTitle('comprovante.pdf')).toHaveAttribute('src', 'blob:anexo');

    fireEvent.click(within(dialog).getByTitle('Fechar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não oferece visualizar o que o navegador não mostra', () => {
    render(
      <AttachmentPreview
        attachment={attachment({
          originalName: 'planilha.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })}
      />,
    );

    expect(screen.queryByTitle('Visualizar')).not.toBeInTheDocument();
    expect(screen.getByTitle('Baixar')).toBeInTheDocument();
  });

  it('avisa na janela quando o arquivo não está mais no servidor', async () => {
    mocks.get.mockImplementation(() => Promise.reject(notFound()));
    render(<AttachmentPreview attachment={attachment()} />);

    fireEvent.click(screen.getByTitle('Visualizar'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(MISSING_FILE_NOTICE)).toBeInTheDocument();
  });
});
