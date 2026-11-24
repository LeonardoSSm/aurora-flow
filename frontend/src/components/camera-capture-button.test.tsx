import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { makeFakeStream, mockCameraEnvironment } from '../test/camera-env';
import { CameraCaptureButton } from './camera-capture-button';

describe('CameraCaptureButton', () => {
  let restore: () => void = () => undefined;

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  describe('em tela de toque (celular/tablet)', () => {
    beforeEach(() => {
      restore = mockCameraEnvironment({ touch: true });
    });

    it('abre a câmera nativa pelo input capture e entrega a foto tirada', () => {
      const onCapture = vi.fn();
      const { container } = render(<CameraCaptureButton onCapture={onCapture} />);

      expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeInTheDocument();
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toHaveAttribute('capture', 'environment');
      expect(input).toHaveAttribute('accept', 'image/*');

      const clickSpy = vi.spyOn(input, 'click');
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));
      expect(clickSpy).toHaveBeenCalledTimes(1);

      const photo = new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' });
      fireEvent.change(input, { target: { files: [photo] } });
      expect(onCapture).toHaveBeenCalledWith(photo);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('não dispara onCapture quando o usuário cancela a câmera sem tirar foto', () => {
      const onCapture = vi.fn();
      const { container } = render(<CameraCaptureButton onCapture={onCapture} />);

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [] } });
      expect(onCapture).not.toHaveBeenCalled();
    });
  });

  describe('no computador com webcam', () => {
    const getUserMedia = vi.fn();

    beforeEach(() => {
      getUserMedia.mockReset();
      restore = mockCameraEnvironment({ getUserMedia });
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
      vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    });

    it('abre o diálogo com a câmera traseira preferida, captura um JPEG e desliga a câmera', async () => {
      const { stream, stop } = makeFakeStream();
      getUserMedia.mockResolvedValue(stream);
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
        callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
      );
      const onCapture = vi.fn();

      render(<CameraCaptureButton onCapture={onCapture} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));

      expect(await screen.findByRole('dialog', { name: 'Tirar foto' })).toBeInTheDocument();
      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: false,
          video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
        }),
      );

      const capture = screen.getByRole('button', { name: 'Capturar' });
      await waitFor(() => expect(capture).toBeEnabled());
      fireEvent.click(capture);

      expect(drawImage).toHaveBeenCalled();
      expect(onCapture).toHaveBeenCalledTimes(1);
      const file = onCapture.mock.calls[0][0] as File;
      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/jpeg');
      expect(file.name).toMatch(/^foto_\d+\.jpg$/);
      expect(stop).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('cancelar fecha o diálogo, desliga a câmera e não entrega foto', async () => {
      const { stream, stop } = makeFakeStream();
      getUserMedia.mockResolvedValue(stream);
      const onCapture = vi.fn();

      render(<CameraCaptureButton onCapture={onCapture} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar' })).toBeEnabled());

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(stop).toHaveBeenCalled();
      expect(onCapture).not.toHaveBeenCalled();
    });

    it('Esc fecha o diálogo e desliga a câmera', async () => {
      const { stream, stop } = makeFakeStream();
      getUserMedia.mockResolvedValue(stream);

      render(<CameraCaptureButton onCapture={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar' })).toBeEnabled());

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(stop).toHaveBeenCalled();
    });

    it('re-renderizar o pai com um onCapture novo não reinicia a câmera', async () => {
      const { stream } = makeFakeStream();
      getUserMedia.mockResolvedValue(stream);

      const { rerender } = render(<CameraCaptureButton onCapture={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar' })).toBeEnabled());

      rerender(<CameraCaptureButton onCapture={vi.fn()} />);
      rerender(<CameraCaptureButton onCapture={vi.fn()} />);

      expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('mostra o motivo quando o navegador nega a permissão e não deixa capturar', async () => {
      getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

      render(<CameraCaptureButton onCapture={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Permita o acesso à câmera');
      expect(screen.getByRole('button', { name: 'Capturar' })).toBeDisabled();
    });

    it('avisa quando não há câmera no dispositivo', async () => {
      getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));

      render(<CameraCaptureButton onCapture={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Nenhuma câmera foi encontrada');
    });
  });

  it('não renderiza nada quando o dispositivo não tem como abrir a câmera', () => {
    restore = mockCameraEnvironment({ touch: false });

    const { container } = render(<CameraCaptureButton onCapture={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
