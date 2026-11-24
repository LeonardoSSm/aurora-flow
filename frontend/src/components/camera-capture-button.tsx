import { Camera } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/use-escape-key';
import { Button, Card } from './ui';

/**
 * - `native`: tela de toque (celular/tablet) — um `<input capture>` abre o app de câmera do
 *   aparelho, com foco, flash e resolução total.
 * - `stream`: computador com webcam — abre um diálogo com a imagem ao vivo (getUserMedia, que
 *   só existe em HTTPS/localhost).
 * - `none`: sem como abrir a câmera; o botão nem aparece.
 */
export type CameraMode = 'native' | 'stream' | 'none';

export function detectCameraMode(): CameraMode {
  if (typeof window === 'undefined') return 'none';
  const isTouchDevice =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice) return 'native';
  if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
    return 'stream';
  }
  return 'none';
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permita o acesso à câmera no navegador para tirar a foto.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera foi encontrada neste dispositivo.';
  }
  if (name === 'NotReadableError') {
    return 'A câmera está em uso por outro aplicativo.';
  }
  return 'Não foi possível abrir a câmera.';
}

function CameraCaptureDialog({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  // O pai passa um `onClose` novo a cada render; o efeito da câmera não pode depender dele,
  // senão a câmera seria desligada e religada sempre que o formulário re-renderizasse.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Na pilha de Esc: fecha só a câmera, não o modal do card que está embaixo.
  useEscapeKey(() => onCloseRef.current());

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(cameraErrorMessage(error));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function fail(message: string) {
    setErrorMessage(message);
    setStatus('error');
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      fail('Não foi possível capturar a foto. Tente novamente.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          fail('Não foi possível capturar a foto. Tente novamente.');
          return;
        }
        onCapture(new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="grid max-h-[100dvh] w-full max-w-xl grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden rounded-b-none sm:rounded-2xl"
      >
        <h2 id={titleId} className="text-lg font-extrabold text-tx-primary">
          Tirar foto
        </h2>

        <div className={status === 'error' ? 'hidden' : 'overflow-hidden rounded-xl bg-black'}>
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-video max-h-[60dvh] w-full object-contain"
          />
        </div>

        {status === 'starting' ? (
          <p className="text-sm text-tx-secondary">Abrindo a câmera…</p>
        ) : null}
        {status === 'error' ? (
          <p role="alert" className="break-words rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="subtle" size="sm" className="min-h-11 sm:min-h-0" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="min-h-11 sm:min-h-0"
            disabled={status !== 'ready'}
            onClick={handleCapture}
          >
            Capturar
          </Button>
        </div>
      </Card>
    </div>,
    document.body,
  );
}

type CameraCaptureButtonProps = {
  /** Recebe a foto tirada, como um `File` JPEG pronto para o mesmo fluxo de upload de arquivos. */
  onCapture: (file: File) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function CameraCaptureButton({
  onCapture,
  disabled = false,
  className,
  style,
  children,
}: CameraCaptureButtonProps) {
  const [mode] = useState<CameraMode>(detectCameraMode);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (mode === 'none') return null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (mode === 'native') inputRef.current?.click();
          else setDialogOpen(true);
        }}
        className={className}
        style={style}
      >
        <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
        {children ?? 'Tirar foto'}
      </button>

      {mode === 'native' ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Câmera"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onCapture(file);
          }}
        />
      ) : null}

      {dialogOpen ? (
        <CameraCaptureDialog
          onClose={() => setDialogOpen(false)}
          onCapture={(file) => {
            setDialogOpen(false);
            onCapture(file);
          }}
        />
      ) : null}
    </>
  );
}
