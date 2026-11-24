import axios from 'axios';
import { Download, Eye, File, FileText, Paperclip, Sheet, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../services/api';
import { downloadAttachment } from '../services/solicitations-api';
import type { Attachment, LabelValidationField, LabelValidationFieldStatus, LabelValidationResult } from '../types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function attachmentIcon(mimeType: string): ReactNode {
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
  if (mimeType.startsWith('image/')) return <File className="h-4 w-4 shrink-0 text-purple-500" />;
  if (mimeType.includes('spreadsheetml') || mimeType.includes('excel'))
    return <Sheet className="h-4 w-4 shrink-0 text-green-600" />;
  return <Paperclip className="h-4 w-4 shrink-0 text-tx-secondary" />;
}

/** Linha de anexo somente-leitura (com download opcional) — usada onde não faz sentido excluir, ex.: revisão de aprovação. */
export function AttachmentRow({
  attachment,
  onView,
  onDownload,
  onDelete,
  notice,
}: {
  attachment: Attachment;
  onView?: (attachment: Attachment) => void;
  onDownload?: (attachment: Attachment) => void;
  onDelete?: (attachment: Attachment) => void;
  /** Aviso em vermelho abaixo do nome (ex.: o arquivo não está mais no servidor). */
  notice?: string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-border-default/40 bg-surface-container-low px-3 py-2">
      {attachmentIcon(attachment.mimeType)}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-tx-primary">{attachment.originalName}</p>
        {attachment.description ? (
          <p className="whitespace-pre-wrap break-words text-xs text-tx-primary">{attachment.description}</p>
        ) : null}
        <p className="break-words text-xs text-tx-secondary">
          {formatBytes(attachment.sizeBytes)} · {attachment.uploadedByUser?.fullName ?? 'Solicitante'} ·{' '}
          {new Date(attachment.createdAt).toLocaleDateString('pt-BR')}
        </p>
        {notice ? <p className="break-words text-xs font-medium text-error">{notice}</p> : null}
      </div>
      {onView ? (
        <button
          type="button"
          onClick={() => onView(attachment)}
          title="Visualizar"
          className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
        >
          <Eye className="h-4 w-4" />
        </button>
      ) : null}
      {onDownload ? (
        <button
          type="button"
          onClick={() => onDownload(attachment)}
          title="Baixar"
          className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
        >
          <Download className="h-4 w-4" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(attachment)}
          title="Excluir"
          className="shrink-0 rounded p-1 text-tx-secondary hover:bg-error/10 hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}

const LABEL_STATUS_STYLE: Record<LabelValidationFieldStatus, { bg: string; text: string; label: string }> = {
  OK: { bg: 'bg-green-100', text: 'text-green-700', label: 'OK' },
  DIVERGENTE: { bg: 'bg-red-100', text: 'text-red-700', label: 'Divergente' },
  AUSENTE: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Ausente' },
  ATENCAO: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Atenção' },
};

function LabelFieldRow({ label, field }: { label: string; field: LabelValidationField }) {
  const style = LABEL_STATUS_STYLE[field.status] ?? LABEL_STATUS_STYLE.AUSENTE;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 break-words text-tx-secondary">
        {label}: <span className="font-medium text-tx-primary">{field.valor || '—'}</span>
      </span>
      <span className={['shrink-0 rounded-full px-2 py-0.5 font-bold', style.bg, style.text].join(' ')}>
        {style.label}
      </span>
    </div>
  );
}

/** Veredito do agente de IA "validador-de-etiquetas" para a foto de uma etiqueta. */
export function LabelValidationPanel({ result }: { result: LabelValidationResult }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1.5 rounded-xl border border-border-default/40 bg-surface-container-low px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-xs font-bold uppercase text-tx-secondary">Validação IA{result.tipo ? ` · ${result.tipo}` : ''}</span>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold',
            result.aprovada ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
          ].join(' ')}
        >
          {result.aprovada ? 'Aprovado ✓' : 'Reprovado'}
        </span>
      </div>
      <LabelFieldRow label="Lote" field={result.lote} />
      <LabelFieldRow label="Fabricação" field={result.fabricacao} />
      <LabelFieldRow label="Validade" field={result.validade} />
      {result.mensagem ? <p className="break-words text-xs text-tx-secondary">{result.mensagem}</p> : null}
    </div>
  );
}

export const MISSING_FILE_NOTICE = 'O arquivo não está mais no servidor. Peça para enviar de novo.';

export function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/** Tipos que o navegador mostra sozinho; os demais (planilha, Word…) só dá para baixar. */
export function canViewInBrowser(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType === 'text/plain';
}

/**
 * Abre o anexo por cima da tela, sem baixar. O download é autenticado (Bearer via axios), então
 * busca o blob e mostra por object URL. Vai para o body porque costuma abrir de dentro de outro
 * modal, que corta o que passa da sua área.
 */
export function AttachmentViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void api
      .get(`/attachments/${attachment.id}/download`, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        // O tipo vem do registro: o navegador só mostra o PDF no iframe se o blob disser que é PDF.
        url = URL.createObjectURL(new Blob([response.data as Blob], { type: attachment.mimeType }));
        setObjectUrl(url);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(isNotFound(reason) ? MISSING_FILE_NOTICE : 'Não foi possível abrir o arquivo.');
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, attachment.mimeType]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.originalName}
      className="fixed inset-0 z-[130] flex flex-col bg-black/80 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-w-0 items-center gap-2 text-white">
          <p className="min-w-0 flex-1 truncate text-sm font-bold">{attachment.originalName}</p>
          {objectUrl ? (
            <button
              type="button"
              onClick={() => void downloadAttachment(attachment.id, attachment.originalName)}
              title="Baixar"
              className="shrink-0 rounded-full p-2 hover:bg-white/15"
            >
              <Download className="h-5 w-5" />
            </button>
          ) : null}
          <button type="button" onClick={onClose} title="Fechar" className="shrink-0 rounded-full p-2 hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-bg-surface">
          {error ? (
            <p className="px-4 text-center text-sm font-medium text-error">{error}</p>
          ) : !objectUrl ? (
            <p className="text-sm text-tx-secondary">Carregando…</p>
          ) : isImage ? (
            <img src={objectUrl} alt={attachment.originalName} className="h-full w-full object-contain" />
          ) : (
            <iframe src={objectUrl} title={attachment.originalName} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Preview inline de imagem para anexos de imagem (ex.: a foto de validação de
 * uma fase). O download é autenticado (Bearer token via axios), então não dá
 * para usar a URL direto num <img src>; busca o blob e cria uma object URL.
 */
export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // O registro existe, mas o servidor respondeu 404 ao buscar o arquivo (ex.: perdido no disco).
  const [missing, setMissing] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [viewing, setViewing] = useState(false);
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    let url: string | null = null;
    void api
      .get(`/attachments/${attachment.id}/download`, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        url = URL.createObjectURL(response.data as Blob);
        setObjectUrl(url);
      })
      .catch((error: unknown) => {
        // Sem a prévia, cai na linha padrão abaixo.
        if (!cancelled && isNotFound(error)) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, isImage]);

  async function handleDownload(a: Attachment) {
    setDownloadFailed(false);
    try {
      await downloadAttachment(a.id, a.originalName);
    } catch (error) {
      if (isNotFound(error)) setMissing(true);
      else setDownloadFailed(true);
    }
  }

  const viewer = viewing ? <AttachmentViewer attachment={attachment} onClose={() => setViewing(false)} /> : null;

  if (isImage && objectUrl) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => setViewing(true)}
          title="Visualizar"
          className="block min-w-0 overflow-hidden rounded-xl border border-border-default/40 text-left"
        >
          <img
            src={objectUrl}
            alt={attachment.originalName}
            className="max-h-64 w-full object-contain bg-surface-container-low"
          />
          <p className="truncate px-3 pt-2 text-xs text-tx-secondary">
            {attachment.originalName} · {formatBytes(attachment.sizeBytes)}
          </p>
          {attachment.description ? (
            <p className="whitespace-pre-wrap break-words px-3 text-xs text-tx-primary">{attachment.description}</p>
          ) : null}
          <span className="block pb-2" />
        </button>
        {attachment.validationResult ? <LabelValidationPanel result={attachment.validationResult} /> : null}
        {viewer}
      </div>
    );
  }
  return (
    <ul className="grid min-w-0 grid-cols-1 gap-1.5">
      <AttachmentRow
        attachment={attachment}
        onView={missing || !canViewInBrowser(attachment.mimeType) ? undefined : () => setViewing(true)}
        onDownload={missing ? undefined : (a) => void handleDownload(a)}
        notice={missing ? MISSING_FILE_NOTICE : downloadFailed ? 'Não foi possível baixar. Tente de novo.' : undefined}
      />
      {viewer}
    </ul>
  );
}

/** Arquivos enviados junto com o formulário: imagem com prévia, os demais com visualizar e baixar. */
export function FormAttachmentsList({
  attachments,
  title = 'Arquivos enviados no formulário',
}: {
  attachments: Attachment[];
  title?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="grid min-w-0 gap-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">{title}</p>
      {attachments.map((attachment) => (
        <AttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
