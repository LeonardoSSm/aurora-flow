import { Archive, CheckCircle, Copy, MoreVertical, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormStatus } from '../types';

type FormActionsCellProps = {
  status: FormStatus;
  isUpdating: boolean;
  canEditForms: boolean;
  canManageLifecycle: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onArchive: () => void;
};

type DropdownItem =
  | { type: 'separator' }
  | {
      type: 'item';
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      onClick: () => void;
      destructive?: boolean;
      disabled?: boolean;
    };

function buildItems(
  status: FormStatus,
  props: Omit<FormActionsCellProps, 'status'>,
): DropdownItem[] {
  const {
    onEdit,
    onDuplicate,
    onPublish,
    onArchive,
    canEditForms,
    canManageLifecycle,
    isUpdating,
  } = props;

  const edit: DropdownItem = {
    type: 'item',
    label: 'Editar',
    icon: Pencil,
    onClick: onEdit,
    disabled: isUpdating || !canEditForms,
  };
  const duplicate: DropdownItem = {
    type: 'item',
    label: 'Duplicar',
    icon: Copy,
    onClick: onDuplicate,
    disabled: isUpdating || !canEditForms,
  };
  const publish: DropdownItem = {
    type: 'item',
    label: 'Publicar',
    icon: CheckCircle,
    onClick: onPublish,
    disabled: isUpdating || !canManageLifecycle,
  };
  const archive: DropdownItem = {
    type: 'item',
    label: 'Arquivar',
    icon: Archive,
    onClick: onArchive,
    disabled: isUpdating || !canManageLifecycle,
    destructive: true,
  };
  const sep: DropdownItem = { type: 'separator' };

  switch (status) {
    case 'draft':
      return [edit, duplicate, publish, sep, archive];
    case 'published':
      return [edit, duplicate, sep, archive];
    case 'paused':
      return [edit, duplicate, publish, sep, archive];
    case 'expired':
      return [edit, duplicate, sep, archive];
    case 'archived':
      return [duplicate];
  }
}

export function FormActionsCell(props: FormActionsCellProps) {
  const { status, isUpdating } = props;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function handleToggle() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuH = 250;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= menuH ? rect.bottom + 4 : rect.top - menuH - 4;
    setPos({ top, right: window.innerWidth - rect.right });
    setOpen((prev) => !prev);
  }

  const items = buildItems(status, props);

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Mais ações"
        aria-expanded={open}
        onClick={handleToggle}
        disabled={isUpdating}
        className="grid h-8 w-8 place-items-center rounded-lg bg-surface-container-low text-tx-secondary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 min-w-[168px] overflow-hidden rounded-xl border border-border-default/40 bg-bg-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          >
            {items.map((item, i) => {
              if (item.type === 'separator') {
                return <hr key={i} className="my-1 border-border-default/30" />;
              }
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={[
                    'flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    item.destructive
                      ? 'text-error hover:bg-rose-50'
                      : 'text-tx-primary hover:bg-surface-container-low',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
