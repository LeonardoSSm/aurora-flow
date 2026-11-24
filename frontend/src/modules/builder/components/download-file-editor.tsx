import axios from 'axios';
import { Download, FileDown, Loader2, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { DOWNLOAD_FILE_ACCEPT, downloadFileUrl, formatDownloadSize } from '../../forms/download-file';
import { uploadFormDownloadFile } from '../../forms/services/forms-api';
import type { DownloadFileSettings } from '../../forms/types';

const MAX_BYTES = 10 * 1024 * 1024;

function uploadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (error.response?.status === 413) return 'O arquivo passa de 10 MB.';
    if (error.response?.status === 403) return 'Você não pode editar este processo.';
  }
  return 'Não foi possível enviar o arquivo. Tente de novo.';
}

/**
 * Arquivo de um campo "Arquivo para baixar". O envio precisa do processo já salvo (o arquivo fica
 * guardado no processo); o link público só passa a ter o arquivo depois de salvar e publicar.
 */
export function DownloadFileEditor({
  formId,
  file,
  onChange,
}: {
  formId: string | null;
  file: DownloadFileSettings | undefined;
  onChange: (file: DownloadFileSettings | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File | undefined) {
    if (!selected || !formId) return;
    setError(null);
    if (selected.size > MAX_BYTES) {
      setError('O arquivo passa de 10 MB.');
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadFormDownloadFile(formId, selected));
    } catch (uploadError) {
      setError(uploadErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  }

  const buttonClass =
    'inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border-strong px-2.5 text-xs font-bold text-tx-secondary hover:bg-bg-hover disabled:opacity-50';

  return (
    <div className="grid gap-1.5 text-xs font-bold text-tx-secondary">
      Arquivo para o solicitante baixar
      <div className="grid gap-2 rounded-[10px] border border-border-default bg-bg-s2 px-3.5 py-3">
        {file ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <FileDown className="h-4 w-4 shrink-0 text-primary dark:text-blue-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-tx-primary">{file.name}</p>
              <p className="text-[11px] font-normal text-tx-muted">{formatDownloadSize(file.size)}</p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] font-normal text-tx-secondary">
            {formId
              ? 'Nenhum arquivo ainda. PDF, Word, Excel, ODT/ODS, JPG ou PNG, até 10 MB.'
              : 'Salve o processo uma vez para poder enviar o arquivo.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!formId || uploading}
            onClick={() => inputRef.current?.click()}
            className={buttonClass}
          >
            {uploading ? (
              <Loader2 className="h-[13px] w-[13px] animate-spin" />
            ) : (
              <Upload className="h-[13px] w-[13px]" />
            )}
            {uploading ? 'Enviando…' : file ? 'Trocar arquivo' : 'Enviar arquivo'}
          </button>
          {file ? (
            <>
              <a href={downloadFileUrl(file)} download={file.name} className={buttonClass}>
                <Download className="h-[13px] w-[13px]" />
                Baixar
              </a>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setError(null);
                  onChange(undefined);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-bold text-error hover:bg-[#fff1f1] disabled:opacity-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-[13px] w-[13px]" />
                Remover
              </button>
            </>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs font-semibold text-error">
            {error}
          </p>
        ) : null}
        <p className="text-[11px] font-normal text-tx-muted">
          Quer o arquivo de volta assinado? Adicione um campo “Upload de Arquivo” logo abaixo.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={DOWNLOAD_FILE_ACCEPT}
        className="hidden"
        aria-label="Escolher arquivo para baixar"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
