import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadFileEditor } from './download-file-editor';

const uploadFormDownloadFile = vi.fn();
vi.mock('../../forms/services/forms-api', () => ({
  uploadFormDownloadFile: (...args: unknown[]) => uploadFormDownloadFile(...args),
}));

const FORM_ID = '11111111-2222-4333-8444-555555555555';
const saved = {
  path: `${FORM_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/Termo.pdf`,
  name: 'Termo.pdf',
  size: 2048,
};

function pick(file: File) {
  fireEvent.change(screen.getByLabelText('Escolher arquivo para baixar'), { target: { files: [file] } });
}

describe('DownloadFileEditor', () => {
  beforeEach(() => {
    uploadFormDownloadFile.mockReset();
  });

  it('processo ainda não salvo: pede para salvar e não deixa enviar', () => {
    render(<DownloadFileEditor formId={null} file={undefined} onChange={() => {}} />);
    expect(screen.getByText('Salve o processo uma vez para poder enviar o arquivo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar arquivo/i })).toBeDisabled();
  });

  it('envia o arquivo escolhido e devolve o que vai no campo', async () => {
    uploadFormDownloadFile.mockResolvedValue(saved);
    const onChange = vi.fn();
    render(<DownloadFileEditor formId={FORM_ID} file={undefined} onChange={onChange} />);
    const file = new File(['%PDF-1.7'], 'Termo.pdf', { type: 'application/pdf' });
    pick(file);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(saved));
    expect(uploadFormDownloadFile).toHaveBeenCalledWith(FORM_ID, file);
  });

  it('mostra a recusa do servidor e não mexe no campo', async () => {
    uploadFormDownloadFile.mockRejectedValue(
      new AxiosError('400', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Envie um PDF, Word (DOC/DOCX), Excel (XLS/XLSX), ODT/ODS ou imagem JPG/PNG.' },
      }),
    );
    const onChange = vi.fn();
    render(<DownloadFileEditor formId={FORM_ID} file={undefined} onChange={onChange} />);
    pick(new File(['<html>'], 'termo.html', { type: 'text/html' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie um PDF');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arquivo acima de 10 MB nem sai do navegador', () => {
    render(<DownloadFileEditor formId={FORM_ID} file={undefined} onChange={() => {}} />);
    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    pick(big);
    expect(screen.getByRole('alert')).toHaveTextContent('10 MB');
    expect(uploadFormDownloadFile).not.toHaveBeenCalled();
  });

  it('com arquivo: mostra nome e tamanho, e Remover limpa o campo', () => {
    const onChange = vi.fn();
    render(<DownloadFileEditor formId={FORM_ID} file={saved} onChange={onChange} />);
    expect(screen.getByText('Termo.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trocar arquivo/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /remover/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
