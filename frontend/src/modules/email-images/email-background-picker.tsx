import { ImageUp, RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  EMAIL_IMAGE_MAX_BYTES,
  emailImageErrorMessage,
  fetchEmailImageBlob,
  uploadEmailImage,
} from './email-images-api';

/** Prévia de uma imagem dos e-mails (`null` = arte padrão), buscada com o login da sessão. */
export function EmailImagePreview({ imageId, alt }: { imageId: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    fetchEmailImageBlob(imageId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  return (
    <div className="aspect-[16/9] w-full overflow-hidden rounded-[8px] border border-border-strong bg-[#e6e7e9]">
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-xs text-tx-secondary">
          {failed ? 'Não foi possível carregar a prévia.' : 'Carregando prévia…'}
        </div>
      )}
    </div>
  );
}

/**
 * Escolha da arte de fundo do e-mail: mostra a atual, troca por outra (JPG/PNG até 3 MB, enviada na
 * hora) e volta para a de reserva (`fallbackLabel`: a arte geral ou a padrão). O valor é o id da
 * imagem enviada, ou `null` = usar a de reserva.
 */
export function EmailBackgroundPicker({
  value,
  onChange,
  fallbackImageId,
  fallbackLabel,
}: {
  value: string | null;
  onChange: (imageId: string | null) => void;
  /** Imagem mostrada quando não há uma própria (`null` = arte padrão do sistema). */
  fallbackImageId: string | null;
  /** Ex.: "a arte geral" ou "a arte padrão". */
  fallbackLabel: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Envie uma imagem JPG ou PNG.');
      return;
    }
    if (file.size > EMAIL_IMAGE_MAX_BYTES) {
      setError('A imagem passa de 3 MB — reduza o tamanho (2000 px de largura já basta).');
      return;
    }
    setUploading(true);
    try {
      const image = await uploadEmailImage(file);
      onChange(image.id);
    } catch (uploadError) {
      setError(emailImageErrorMessage(uploadError));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="grid max-w-[420px] gap-2">
      <EmailImagePreview
        imageId={value ?? fallbackImageId}
        alt={value ? 'Arte de fundo escolhida' : `Prévia: ${fallbackLabel}`}
      />
      <p className="text-xs text-tx-secondary">
        {value ? 'Arte própria.' : `Usando ${fallbackLabel}.`} JPG ou PNG até 3 MB; o ideal é 2000 × 1125
        px, com o destaque longe do centro (o cartão com as notas fica por cima, no meio).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border-strong px-3 text-sm font-semibold text-tx-primary hover:bg-bg-hover ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <ImageUp className="h-4 w-4" />
          {uploading ? 'Enviando…' : 'Trocar imagem'}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Escolher a arte de fundo"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold text-tx-secondary hover:bg-bg-hover"
          >
            <RotateCcw className="h-4 w-4" />
            Voltar para {fallbackLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs font-semibold text-error">{error}</p> : null}
    </div>
  );
}
