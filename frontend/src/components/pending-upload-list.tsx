import { Paperclip, X } from 'lucide-react';
import {
  FILE_LABEL_REQUIRED_MESSAGE,
  formatFileSize,
  isUploadLabeled,
  splitFileName,
  type PendingUpload,
} from '../lib/attachment-upload';

type PendingUploadListProps = {
  uploads: PendingUpload[];
  /** Cada arquivo precisa de um nome novo ou de uma descrição. */
  requireLabel: boolean;
  /** Mostra o aviso nos arquivos sem nome/descrição (depois de uma tentativa de enviar). */
  showErrors?: boolean;
  disabled?: boolean;
  /** 'public' = formulário público (cores do formulário, via --tf-*); 'app' = telas internas. */
  variant?: 'public' | 'app';
  onChange: (id: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => void;
  onRemove: (index: number) => void;
};

const publicInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  fontSize: 13,
  color: 'var(--tf-text)',
  background: 'var(--tf-background)',
};

const appInput =
  'h-9 w-full rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';

/**
 * Arquivos escolhidos e ainda não enviados, cada um com o nome (a extensão fica fixa ao lado) e a
 * descrição. Mostra quanto a foto encolheu quando foi otimizada.
 */
export function PendingUploadList({
  uploads,
  requireLabel,
  showErrors = false,
  disabled = false,
  variant = 'app',
  onChange,
  onRemove,
}: PendingUploadListProps) {
  if (uploads.length === 0) return null;
  const isPublic = variant === 'public';

  return (
    <ul className="grid grid-cols-1 gap-2" aria-label="Arquivos a enviar">
      {uploads.map((upload, index) => {
        const { ext } = splitFileName(upload.file.name);
        const missing = requireLabel && !isUploadLabeled(upload);
        const invalid = showErrors && missing;
        const shrunk = upload.originalSize > upload.file.size;
        const nameId = `${upload.id}-name`;
        const descriptionId = `${upload.id}-description`;
        const errorColor = isPublic ? 'var(--tf-danger)' : undefined;

        return (
          <li
            key={upload.id}
            className={
              isPublic
                ? 'grid gap-2 rounded-lg px-3 py-2.5'
                : `grid gap-2 rounded-xl border bg-surface-container-low px-3 py-2.5 ${
                    invalid ? 'border-error' : 'border-border-default/40'
                  }`
            }
            style={
              isPublic
                ? {
                    border: `1px solid ${invalid ? 'var(--tf-danger)' : 'var(--tf-border)'}`,
                    background: 'var(--tf-surface)',
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <Paperclip
                className={isPublic ? 'h-4 w-4 shrink-0' : 'h-4 w-4 shrink-0 text-tx-secondary'}
                style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
              />
              <span
                className={isPublic ? 'min-w-0 flex-1 truncate text-xs' : 'min-w-0 flex-1 truncate text-xs text-tx-secondary'}
                style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
                title={upload.file.name}
              >
                {upload.file.name} · {formatFileSize(upload.file.size)}
                {shrunk ? ` (otimizada de ${formatFileSize(upload.originalSize)})` : ''}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(index);
                }}
                className={
                  isPublic
                    ? 'shrink-0 rounded p-0.5 hover:bg-red-50 disabled:opacity-50'
                    : 'shrink-0 rounded p-1 text-tx-secondary hover:bg-error/10 hover:text-error disabled:opacity-50'
                }
                style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
                aria-label={`Remover ${upload.file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div
                className={isPublic ? 'grid gap-1 text-xs font-semibold' : 'grid gap-1 text-xs font-semibold text-tx-secondary'}
                style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
              >
                <label htmlFor={nameId}>Nome do arquivo</label>
                <span className="flex items-center gap-1.5">
                  <input
                    id={nameId}
                    type="text"
                    value={upload.name}
                    maxLength={190}
                    disabled={disabled}
                    onChange={(event) => onChange(upload.id, { name: event.target.value })}
                    className={isPublic ? undefined : appInput}
                    style={isPublic ? publicInput : undefined}
                  />
                  {ext ? (
                    <span
                      className={isPublic ? 'shrink-0 text-xs' : 'shrink-0 text-xs text-tx-secondary'}
                      style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
                    >
                      {ext}
                    </span>
                  ) : null}
                </span>
              </div>
              <label
                htmlFor={descriptionId}
                className={isPublic ? 'grid gap-1 text-xs font-semibold' : 'grid gap-1 text-xs font-semibold text-tx-secondary'}
                style={isPublic ? { color: 'var(--tf-text-muted)' } : undefined}
              >
                Descrição
                <input
                  id={descriptionId}
                  type="text"
                  value={upload.description}
                  maxLength={1000}
                  disabled={disabled}
                  placeholder="O que é este arquivo?"
                  onChange={(event) => onChange(upload.id, { description: event.target.value })}
                  className={isPublic ? undefined : appInput}
                  style={isPublic ? publicInput : undefined}
                />
              </label>
            </div>

            {invalid ? (
              <span
                role="alert"
                className={isPublic ? 'text-xs font-semibold' : 'text-xs font-semibold text-error'}
                style={errorColor ? { color: errorColor } : undefined}
              >
                {FILE_LABEL_REQUIRED_MESSAGE}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
