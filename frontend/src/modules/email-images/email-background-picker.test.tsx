import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailBackgroundPicker } from './email-background-picker';
import { fetchEmailImageBlob, uploadEmailImage } from './email-images-api';
import type * as EmailImagesApi from './email-images-api';

vi.mock('./email-images-api', async (importOriginal) => {
  const original = await importOriginal<typeof EmailImagesApi>();
  return { ...original, uploadEmailImage: vi.fn(), fetchEmailImageBlob: vi.fn() };
});

const uploadMock = vi.mocked(uploadEmailImage);
const blobMock = vi.mocked(fetchEmailImageBlob);

beforeEach(() => {
  uploadMock.mockReset();
  blobMock.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
});

function pick(file: File) {
  fireEvent.change(screen.getByLabelText('Escolher a arte de fundo'), { target: { files: [file] } });
}

describe('EmailBackgroundPicker', () => {
  it('sem arte própria mostra a de reserva; trocar envia a imagem e devolve o id', async () => {
    const onChange = vi.fn();
    uploadMock.mockResolvedValue({ id: 'img-9', name: 'arte.png', mimeType: 'image/png', sizeBytes: 10, createdAt: '' });
    render(<EmailBackgroundPicker value={null} onChange={onChange} fallbackImageId="geral-1" fallbackLabel="a arte geral" />);

    expect(await screen.findByAltText('Prévia: a arte geral')).toHaveAttribute('src', 'blob:previa');
    expect(blobMock).toHaveBeenCalledWith('geral-1');
    expect(screen.getByText(/Usando a arte geral\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar para/ })).not.toBeInTheDocument();

    const file = new File(['x'], 'arte.png', { type: 'image/png' });
    pick(file);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('img-9'));
    expect(uploadMock).toHaveBeenCalledWith(file);
  });

  it('com arte própria: prévia dela e "Voltar para…" limpa a escolha', async () => {
    const onChange = vi.fn();
    render(<EmailBackgroundPicker value="img-9" onChange={onChange} fallbackImageId={null} fallbackLabel="a arte padrão" />);
    expect(await screen.findByAltText('Arte de fundo escolhida')).toBeInTheDocument();
    expect(blobMock).toHaveBeenCalledWith('img-9');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a arte padrão' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('recusa na hora o que não é JPG/PNG ou passa de 3 MB, sem enviar', async () => {
    const onChange = vi.fn();
    render(<EmailBackgroundPicker value={null} onChange={onChange} fallbackImageId={null} fallbackLabel="a arte padrão" />);

    pick(new File(['<svg/>'], 'arte.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('Envie uma imagem JPG ou PNG.')).toBeInTheDocument();

    const grande = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' });
    pick(grande);
    expect(await screen.findByText(/passa de 3 MB/)).toBeInTheDocument();

    expect(uploadMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('erro do servidor aparece com a mensagem dele', async () => {
    uploadMock.mockRejectedValue(new Error('rede'));
    render(<EmailBackgroundPicker value={null} onChange={vi.fn()} fallbackImageId={null} fallbackLabel="a arte padrão" />);
    pick(new File(['x'], 'arte.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('Não foi possível enviar a imagem. Tente de novo.')).toBeInTheDocument();
  });
});
