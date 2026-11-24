import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  KeyRound,
  Mail,
  Pencil,
  Search,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '../../../app/auth-context';
import { Button, Card, useToast } from '../../../components/ui';
import { PasswordStrengthBar } from '../../../components/ui/password-strength';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { cn } from '../../../lib/cn';
import { useAdminBackground } from '../admin-route';
import {
  AdminHeaderActions,
  AdminModalOverlay,
  useAdminEscape,
  useAdminHeader,
  useInert,
} from '../components/admin-modal-context';
import {
  type PendingProcessAccess,
  UserProcessesStep,
} from '../../process-access/components/user-processes-step';
import { setProcessMember } from '../../process-access/services/process-access-api';
import { useAreasQuery } from '../hooks/use-areas';
import { firstName, type UserPanelState, useAdminUsers } from '../hooks/use-admin-users';
import { useRolesQuery } from '../hooks/use-roles';
import { useSettingsQuery } from '../hooks/use-settings';
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from '../services/admin-api';
import type { Role } from '../services/roles-api';
import {
  buildCreatePayload,
  buildUpdatePayload,
  canSubmitUserForm,
  type FirstAccessMethod,
  isValidEmail,
} from './user-form-payload';

const FALLBACK_COLOR = 'bg-slate-100 text-slate-700';

const COLOR_STYLES: Record<string, string> = {
  red: 'bg-rose-100 text-rose-800',
  blue: 'bg-sky-100 text-sky-800',
  green: 'bg-emerald-100 text-emerald-800',
  gray: 'bg-slate-100 text-slate-700',
  yellow: 'bg-amber-100 text-amber-800',
  purple: 'bg-violet-100 text-violet-800',
};

/** Ponto da opção no dropdown de perfil: a cor do texto do badge. */
const DOT_STYLES: Record<string, string> = {
  red: 'bg-rose-800',
  blue: 'bg-sky-800',
  green: 'bg-emerald-800',
  gray: 'bg-slate-700',
  yellow: 'bg-amber-800',
  purple: 'bg-violet-800',
};

function roleBadgeStyle(roles: Role[], code: string): string {
  const role = roles.find((r) => r.code === code);
  return (role ? COLOR_STYLES[role.color] : undefined) ?? FALLBACK_COLOR;
}

function roleLabel(roles: Role[], code: string): string {
  return roles.find((r) => r.code === code)?.name ?? code;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0]];
  return letters.filter(Boolean).join('').toUpperCase();
}

const SLIDE_MS = 520;
const HIGHLIGHT_MS = 1800;

/** Destaque suave da cor da marca (mesmo padrão dos chips do construtor). */
const PRIMARY_SOFT = 'bg-brand-primary-light text-primary dark:bg-primary/30 dark:text-tx-primary';
const FOCUS_RING = 'shadow-[0_0_0_3px_rgba(26,60,143,.15)]';

const labelClass = 'grid min-w-0 gap-1.5 text-[13px] font-semibold text-tx-secondary';
const inputClass =
  'h-[46px] w-full min-w-0 rounded-xl border border-border-default bg-bg-s2 px-3.5 text-[14.5px] font-normal text-tx-primary outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tx-ph focus:border-primary focus:bg-bg-surface focus:shadow-[0_0_0_3px_rgba(26,60,143,.15)]';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function RoleBadge({ roles, code }: { roles: Role[]; code: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase',
        roleBadgeStyle(roles, code),
      )}
    >
      {roleLabel(roles, code)}
    </span>
  );
}

function StatusBadges({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${user.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
      >
        {user.isActive ? 'Ativo' : 'Inativo'}
      </span>
      {user.isActive && !user.lastLoginAt && (
        <span
          className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold uppercase text-amber-800"
          title="Cadastrado, mas ainda não entrou no sistema."
        >
          1º acesso
        </span>
      )}
    </div>
  );
}

// ─── Painel: peças ────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3.5" aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'grid h-[22px] w-[22px] place-items-center rounded-full text-[11.5px] font-extrabold',
            PRIMARY_SOFT,
          )}
        >
          {n}
        </span>
        <h3 className="text-[15px] font-bold text-tx-primary">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** Perfil: listbox com badge + descrição (o select nativo não mostra a cor do perfil). */
function RoleSelect({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
  const selected = roles.find((r) => r.code === value);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Com a lista aberta, o Esc fecha só a lista (fica no topo da pilha do modal).
  useAdminEscape(() => close(true), open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      list?.querySelector<HTMLElement>('[role="option"]');
    target?.focus({ preventScroll: true });
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      options[(next + options.length) % options.length]?.focus({ preventScroll: true });
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(options.length - 1);
    else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div className={labelClass}>
      <span id={labelId}>Perfil</span>
      <div ref={rootRef} className="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={labelId}
          aria-describedby={selected?.description ? `${listId}-desc` : undefined}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'flex h-[46px] w-full min-w-0 items-center gap-2.5 rounded-xl border pl-2.5 pr-3.5 text-left font-normal outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-primary',
            open
              ? cn('border-primary bg-bg-surface', FOCUS_RING)
              : 'border-border-default bg-bg-s2',
          )}
        >
          <RoleBadge roles={roles} code={value} />
          <span id={`${listId}-desc`} className="min-w-0 flex-1 truncate text-[13px] text-tx-muted">
            {selected?.description ?? ''}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 text-tx-muted transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            onKeyDown={onListKeyDown}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-[5] grid max-h-[320px] gap-0.5 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-1.5 shadow-[0_24px_64px_rgba(13,29,41,.18)]"
          >
            {roles.map((role) => {
              const isSelected = role.code === value;
              return (
                <button
                  key={role.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(role.code);
                    close(true);
                  }}
                  className={cn(
                    'grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    isSelected ? PRIMARY_SOFT : 'hover:bg-bg-s3',
                  )}
                >
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          DOT_STYLES[role.color] ?? 'bg-slate-700',
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-sm text-tx-primary',
                          isSelected ? 'font-bold' : 'font-semibold',
                        )}
                      >
                        {role.name}
                      </span>
                    </span>
                    {role.description ? (
                      <span className="pl-4 text-[12.5px] font-normal text-tx-muted">
                        {role.description}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    aria-hidden
                    strokeWidth={2.5}
                    className={cn('h-4 w-4 text-primary', !isSelected && 'invisible')}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ACCESS_METHODS: Array<{
  id: FirstAccessMethod;
  icon: typeof Mail;
  title: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    id: 'invite',
    icon: Mail,
    title: 'Enviar convite por e-mail',
    description: 'A pessoa recebe um link pessoal, válido por 7 dias, para criar a própria senha.',
    recommended: true,
  },
  {
    id: 'password',
    icon: KeyRound,
    title: 'Definir uma senha agora',
    description: 'Você cria a senha e repassa para a pessoa. Nenhum e-mail é enviado.',
  },
  {
    id: 'pre',
    icon: UserCheck,
    title: 'Só pré-cadastrar',
    description:
      'Já pode ser escolhida como aprovadora e entra pela primeira vez com a conta Google corporativa.',
  },
];

function AccessMethodCards({
  method,
  onMethodChange,
  password,
  onPasswordChange,
}: {
  method: FirstAccessMethod;
  onMethodChange: (method: FirstAccessMethod) => void;
  password: string;
  onPasswordChange: (password: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Primeiro acesso" className="grid gap-2.5">
      {ACCESS_METHODS.map(({ id, icon: Icon, title, description, recommended }) => {
        const selected = method === id;
        return (
          <div
            key={id}
            className={cn(
              'overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-150',
              selected
                ? 'border-primary bg-brand-primary-light shadow-[0_0_0_3px_rgba(26,60,143,.12)] dark:bg-primary/20'
                : 'border-border-default bg-bg-surface',
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onMethodChange(id)}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3.5 p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
            >
              <span
                aria-hidden
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-[10px] transition-colors duration-150',
                  selected ? 'bg-primary text-white' : 'bg-bg-s3 text-tx-secondary',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-tx-primary">
                  {title}
                  {recommended ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-px text-[10.5px] font-bold uppercase text-emerald-800">
                      Recomendado
                    </span>
                  ) : null}
                </span>
                <span className="text-[12.5px] text-tx-muted">{description}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'h-[18px] w-[18px] rounded-full bg-bg-surface transition-[border-width,border-color] duration-150',
                  selected ? 'border-[5px] border-primary' : 'border-[1.5px] border-border-strong',
                )}
              />
            </button>
            {id === 'password' && selected ? (
              <div className="grid pb-4 pl-16 pr-3.5">
                <input
                  type="password"
                  aria-label="Senha"
                  autoComplete="new-password"
                  className={cn(inputClass, 'h-11 bg-bg-surface')}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="8+ caracteres, maiúscula, minúscula e número"
                />
                <PasswordStrengthBar password={password} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const sideLabelClass = 'mb-2.5 text-[10px] font-bold uppercase tracking-[.14em] text-tx-muted';

/** Prévia do e-mail real de convite (backend: users/invite/user-invite-email.ts). */
function InvitePreview({ fullName, email }: { fullName: string; email: string }) {
  const { user } = useAuth();
  const { data: settings } = useSettingsQuery();
  const orgName = settings?.find((s) => s.key === 'org.name')?.value?.trim() || 'Aurora Flow';
  const invitedBy = user?.fullName?.trim();
  const intro = invitedBy
    ? `${invitedBy} criou seu acesso ao ${orgName}.`
    : `Seu acesso ao ${orgName} foi criado.`;
  const to = email.trim() || 'e-mail da pessoa';

  return (
    <div className="overflow-hidden rounded-[14px] border border-border-default bg-bg-surface shadow-soft">
      <div className="grid gap-1 border-b border-border-subtle bg-bg-s2 px-4 py-3 text-xs text-tx-muted">
        <p className="truncate">
          <span className="font-semibold text-tx-secondary">Para:</span> {to}
        </p>
        <p className="truncate" title={`[${orgName}] Seu acesso foi criado — defina sua senha`}>
          <span className="font-semibold text-tx-secondary">Assunto:</span> [{orgName}] Seu acesso
          foi criado — defina sua senha
        </p>
      </div>
      <div className="grid gap-3 p-4 pb-5">
        <p className="text-[15px] font-bold text-tx-primary">
          Olá, {firstName(fullName) || 'tudo bem'}!
        </p>
        <p className="text-[13px] leading-[1.55] text-tx-secondary">
          {intro} Para entrar, crie sua senha pelo botão abaixo.
        </p>
        <p className="min-w-0 truncate text-[13px] text-tx-secondary">
          <strong className="text-tx-primary">Seu usuário:</strong> {to}
        </p>
        <span
          aria-hidden
          className="justify-self-start rounded-lg bg-gradient-to-r from-primary to-primary-container px-3.5 py-2 text-[13px] font-bold text-white"
        >
          Criar minha senha
        </span>
        <p className="text-[11.5px] text-tx-muted">
          O link é pessoal, só pode ser usado uma vez e vale por 7 dias.
        </p>
      </div>
    </div>
  );
}

function NoEmailNotice({ method }: { method: 'password' | 'pre' }) {
  return (
    <div className="grid gap-1.5 rounded-[14px] border border-dashed border-border-strong bg-bg-s2 p-4">
      <p className="text-sm font-bold text-tx-primary">Nenhum e-mail será enviado</p>
      <p className="text-[12.5px] leading-[1.55] text-tx-muted">
        {method === 'password'
          ? 'Repasse a senha para a pessoa por um canal seguro. No primeiro acesso ela entra com o e-mail e essa senha.'
          : 'A pessoa fica pré-cadastrada e entra pela primeira vez com a conta Google corporativa. Você pode enviar o convite depois pela lista.'}
      </p>
    </div>
  );
}

function AccountStatusCard({
  user,
  inviting,
  onSendInvite,
}: {
  user: AdminUser;
  inviting: boolean;
  onSendInvite: () => void;
}) {
  const firstAccess = user.isActive && !user.lastLoginAt;
  return (
    <div className="grid gap-3.5 rounded-[14px] border border-border-default bg-bg-surface p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold',
            PRIMARY_SOFT,
          )}
        >
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-tx-primary" title={user.fullName}>
            {user.fullName}
          </p>
          <p className="truncate text-xs text-tx-muted" title={user.email}>
            {user.email}
          </p>
        </div>
      </div>
      <StatusBadges user={user} />
      {firstAccess ? (
        <>
          <p className="text-[12.5px] text-tx-muted">
            Cadastrado, mas ainda não entrou no sistema.
          </p>
          <button
            type="button"
            onClick={onSendInvite}
            disabled={inviting}
            className="inline-flex items-center gap-1.5 justify-self-start rounded-lg bg-bg-surface px-3 py-2 text-[13px] font-bold text-primary ring-1 ring-border-default transition-colors hover:bg-bg-s3 disabled:opacity-60 dark:text-blue-300"
          >
            <Mail className="h-[15px] w-[15px]" aria-hidden />
            {inviting ? 'Enviando...' : 'Reenviar convite'}
          </button>
        </>
      ) : null}
    </div>
  );
}

// ─── Painel de convidar / editar ──────────────────────────────────────────────

type UserFormPanelProps = {
  panel: NonNullable<UserPanelState>;
  /** false = fora da tela (entrando ou saindo); o painel fica inerte. */
  visible: boolean;
  submitting: boolean;
  error: string | null;
  invitingId: string | null;
  onClose: () => void;
  /** Devolve a pessoa criada (null = erro): os processos escolhidos são gravados depois. */
  onCreate: (payload: CreateUserPayload) => Promise<AdminUser | null>;
  onUpdate: (id: string, payload: UpdateUserPayload) => void;
  onSendInvite: (user: AdminUser) => void;
};

/**
 * Formulário de convidar/editar que desliza da direita e ocupa o lugar da lista
 * (cabeçalho do modal incluso) pelo overlay do AdminModal. Não é modal: o foco
 * continua preso só pelo AdminModal; a lista por trás fica inerte.
 */
export function UserFormPanel({
  panel,
  visible,
  submitting,
  error,
  invitingId,
  onClose,
  onCreate,
  onUpdate,
  onSendInvite,
}: UserFormPanelProps) {
  const editing = panel.mode === 'edit' ? panel.user : null;
  const mode = editing ? 'edit' : 'create';
  const { close: closeAdmin } = useAdminBackground();

  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [role, setRole] = useState<string>(editing?.role ?? 'editor');
  const [areaId, setAreaId] = useState<string>(editing?.areaId ?? '');
  const [method, setMethod] = useState<FirstAccessMethod>('invite');
  const [password, setPassword] = useState('');
  const [settled, setSettled] = useState(false);
  const [pendingProcesses, setPendingProcesses] = useState<PendingProcessAccess[]>([]);
  const { showToast } = useToast();

  const { data: areas = [] } = useAreasQuery(false);
  const areaOptions = areas.filter((a) => a.isActive || a.id === areaId);
  const { data: roles = [] } = useRolesQuery();

  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  useInert(panelRef, !visible);
  useAdminEscape(onClose, visible);

  useEffect(() => {
    if (visible) nameRef.current?.focus({ preventScroll: true });
    else setSettled(false);
  }, [visible]);

  const values = { fullName, email, role, areaId, method, password };
  const canSubmit = !submitting && canSubmitUserForm(mode, values);
  const emailError = emailTouched && email.trim() !== '' && !isValidEmail(email);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (editing) {
      onUpdate(editing.id, buildUpdatePayload(values));
      return;
    }
    void onCreate(buildCreatePayload(values)).then(async (created) => {
      if (!created || pendingProcesses.length === 0) return;
      // Os vínculos só existem depois da pessoa: gravados um a um, avisando o que falhar.
      const failed: string[] = [];
      for (const item of pendingProcesses) {
        try {
          await setProcessMember(item.formId, created.id, item.grants);
        } catch {
          failed.push(item.formName);
        }
      }
      if (failed.length > 0) {
        showToast({
          title: `Não foi possível dar acesso a: ${failed.join(", ")}`,
          description: "Abra a pessoa na lista e tente de novo no passo Processos.",
          variant: "error",
        });
      }
    });
  };

  const hint = editing
    ? password
      ? 'A nova senha passa a valer no próximo acesso.'
      : 'Só os campos alterados serão salvos.'
    : method === 'invite'
      ? 'O link do convite expira em 7 dias.'
      : method === 'password'
        ? 'A senha precisa ter pelo menos 8 caracteres.'
        : 'O convite pode ser enviado depois pela lista.';
  const primaryLabel = editing
    ? 'Salvar alterações'
    : method === 'invite'
      ? 'Enviar convite'
      : 'Cadastrar usuário';
  const title = editing ? 'Editar usuário' : 'Convidar usuário';

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={title}
      aria-hidden={!visible || undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'transform') {
          setSettled(visible);
        }
      }}
      className={cn(
        'pointer-events-auto absolute inset-0 flex flex-col bg-bg-surface [transition:transform_520ms_cubic-bezier(.22,1,.36,1),box-shadow_520ms_ease] motion-reduce:transition-none',
        visible ? 'translate-x-0' : 'pointer-events-none translate-x-[101%]',
        !(visible && settled) &&
          'shadow-[-24px_0_48px_rgba(13,29,41,.12)] motion-reduce:shadow-none',
      )}
    >
      <div className="flex items-center gap-3 pl-4 pr-5 pt-4 md:pl-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg pl-2 pr-3 text-[13.5px] font-semibold text-tx-secondary transition-colors hover:bg-bg-s3 hover:text-primary"
        >
          <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
          Voltar para usuários
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <kbd className="hidden rounded-[5px] border border-border-default px-1.5 py-px font-body text-[11px] font-semibold text-tx-muted md:inline-block">
            Esc
          </kbd>
          <button
            type="button"
            onClick={closeAdmin}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-lg text-tx-secondary transition-colors hover:bg-bg-s3"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
      </div>

      <div className="admin-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 md:px-8">
        <h2 className="text-[26px] font-extrabold tracking-[-0.02em] text-tx-primary">{title}</h2>
        <p className="mb-7 mt-1.5 max-w-[560px] text-sm text-tx-muted">
          {editing
            ? 'Atualize os dados, o perfil, os processos a que tem acesso ou a senha desta pessoa.'
            : 'Cadastre a pessoa, defina o que ela pode acessar e escolha como será o primeiro acesso.'}
        </p>

        <div className="flex flex-wrap items-start gap-9">
          <form
            id={formId}
            noValidate
            onSubmit={submit}
            className="grid min-w-0 flex-[1_1_420px] gap-8"
          >
            <Step n={1} title="Dados da pessoa">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3.5">
                <label className={labelClass}>
                  Nome completo
                  <input
                    ref={nameRef}
                    className={inputClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    autoComplete="off"
                  />
                </label>
                <label className={labelClass}>
                  E-mail corporativo
                  <input
                    type="email"
                    className={cn(
                      inputClass,
                      emailError &&
                        'border-red-600 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,.15)]',
                    )}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="joao@empresa.com"
                    autoComplete="off"
                    aria-invalid={emailError || undefined}
                  />
                  {emailError ? (
                    <span className="text-xs font-medium text-red-600">
                      Informe um e-mail válido.
                    </span>
                  ) : null}
                </label>
              </div>
            </Step>

            <Step n={2} title="Perfil de acesso">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] items-start gap-3.5">
                <RoleSelect roles={roles} value={role} onChange={setRole} />
                <label className={labelClass}>
                  Área
                  <span className="relative block min-w-0">
                    <select
                      className={cn(inputClass, 'appearance-none pr-10')}
                      value={areaId}
                      onChange={(e) => setAreaId(e.target.value)}
                    >
                      <option value="">— Sem área —</option>
                      {areaOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.code ? ` (${a.code})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="pointer-events-none absolute right-3.5 top-[15px] h-4 w-4 text-tx-muted"
                    />
                  </span>
                </label>
              </div>
            </Step>

            <Step n={3} title="Processos">
              {editing ? (
                <UserProcessesStep mode="edit" user={{ id: editing.id, role: editing.role }} />
              ) : (
                <UserProcessesStep
                  mode="create"
                  role={role}
                  pending={pendingProcesses}
                  onPendingChange={setPendingProcesses}
                />
              )}
            </Step>

            {editing ? (
              <Step n={4} title="Senha">
                <label className={cn(labelClass, 'max-w-[420px]')}>
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Deixe em branco para manter a atual"
                  />
                  <PasswordStrengthBar password={password} />
                  <span className="text-xs font-normal text-tx-muted">
                    8+ caracteres, com maiúscula, minúscula e número. Em branco, a senha atual
                    continua valendo.
                  </span>
                </label>
              </Step>
            ) : (
              <Step n={4} title="Primeiro acesso">
                <AccessMethodCards
                  method={method}
                  onMethodChange={setMethod}
                  password={password}
                  onPasswordChange={setPassword}
                />
              </Step>
            )}

            {error ? (
              <p role="alert" className="text-sm font-semibold text-red-600">
                {error}
              </p>
            ) : null}
          </form>

          <aside className="sticky top-0 min-w-0 max-w-[340px] flex-[1_1_280px]">
            {editing ? (
              <>
                <p className={sideLabelClass}>Situação da conta</p>
                <AccountStatusCard
                  user={editing}
                  inviting={invitingId === editing.id}
                  onSendInvite={() => onSendInvite(editing)}
                />
              </>
            ) : method === 'invite' ? (
              <>
                <p className={sideLabelClass}>Prévia do convite</p>
                <InvitePreview fullName={fullName} email={email} />
              </>
            ) : (
              <>
                <p className={sideLabelClass}>Sobre este acesso</p>
                <NoEmailNotice method={method} />
              </>
            )}
          </aside>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-default bg-bg-surface px-4 py-3.5 md:px-8">
        <p className="min-w-0 flex-1 text-[12.5px] text-tx-muted">{hint}</p>
        <Button variant="subtle" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" form={formId} disabled={!canSubmit} className="whitespace-nowrap">
          {submitting ? 'Salvando...' : primaryLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mantém o painel montado durante a saída (o formulário só "reseta" depois da
 * animação) e liga `visible` um quadro depois de montar, para a entrada animar.
 */
function useSlidingPanel(panel: UserPanelState) {
  const [rendered, setRendered] = useState<{
    panel: NonNullable<UserPanelState>;
    seq: number;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (panel) {
      seq.current += 1;
      setRendered({ panel, seq: seq.current });
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRendered(null), prefersReducedMotion() ? 0 : SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [panel]);

  return { rendered, visible };
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function AdminUsersView() {
  const {
    users,
    total,
    page,
    totalPages,
    loading,
    submitting,
    error,
    panel,
    setPage,
    setSearch,
    openCreate,
    openEdit,
    closePanel,
    handleCreate,
    handleUpdate,
    handleDeactivate,
    handleSendInvite,
    invitingId,
  } = useAdminUsers();

  const { data: roles = [] } = useRolesQuery();
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const { rendered, visible } = useSlidingPanel(panel);
  useEscapeKey(() => setConfirmDeactivateId(null), confirmDeactivateId !== null);
  useAdminHeader({ description: `${total} usuário(s) no sistema. Gerencie acessos e perfis.` });

  // Quem abriu vem do clique: Safari (e jsdom) não focam o botão ao clicar.
  const rememberOpener = (opener: HTMLElement) => {
    openerRef.current = opener;
  };

  // Ao voltar para a lista, o foco volta para quem abriu o painel — assim que a
  // camada da lista deixa de ser inerte (o modal tira o `inert` alguns renders depois).
  useEffect(() => {
    if (panel || !openerRef.current) return;
    const opener = openerRef.current;
    openerRef.current = null;
    let frame = 0;
    let tries = 0;
    const restore = () => {
      if (!opener.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 10) {
        frame = requestAnimationFrame(restore);
        return;
      }
      opener.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const onCreate = async (payload: CreateUserPayload) => {
    const created = await handleCreate(payload);
    if (created) setHighlightId(created.id);
    return created;
  };

  const onUpdate = async (id: string, payload: UpdateUserPayload) => {
    const updated = await handleUpdate(id, payload);
    if (updated) setHighlightId(id);
  };

  return (
    <section className="grid gap-4">
      <AdminHeaderActions>
        <Button
          size="sm"
          className="whitespace-nowrap"
          onClick={(event) => {
            rememberOpener(event.currentTarget);
            openCreate();
          }}
        >
          Convidar Usuário
        </Button>
      </AdminHeaderActions>

      {/* Search */}
      <div className="flex items-center gap-3">
        <label className="flex h-9 w-full max-w-[360px] items-center gap-2 rounded-[10px] border border-border-default bg-bg-surface px-3 text-tx-ph ring-primary/30 focus-within:ring-2">
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-tx-primary outline-none placeholder:text-tx-ph"
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar por nome ou e-mail"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {users.length > 0 && (
          <span className="ml-auto text-xs text-tx-muted">
            Mostrando {users.length} de {total}
          </span>
        )}
      </div>

      {error && !panel && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-default bg-bg-surface">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[13px]">
          <thead className="bg-bg-s2 text-[11px] uppercase tracking-wide text-tx-secondary">
            <tr>
              <th className="w-[36%] px-4 py-2 font-bold">Usuário</th>
              <th className="w-[18%] px-3 py-2 font-bold">Perfil</th>
              <th className="w-[16%] px-3 py-2 font-bold">Área</th>
              <th className="w-[16%] px-3 py-2 font-bold">Status</th>
              <th className="w-[14%] px-4 py-2 text-right font-bold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* Recarga depois de salvar mantém as linhas: o destaque e o foco de volta dependem delas. */}
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tx-secondary">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tx-secondary">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  data-highlighted={highlightId === user.id || undefined}
                  className={cn(
                    'border-t border-border-subtle transition-colors duration-[1200ms]',
                    highlightId === user.id
                      ? 'bg-brand-primary-light dark:bg-primary/20'
                      : 'hover:bg-bg-s2',
                  )}
                >
                  <td className="px-4 py-2">
                    <div className="truncate font-semibold" title={user.fullName}>
                      {user.fullName}
                    </div>
                    <div className="mt-px truncate text-xs text-tx-muted" title={user.email}>
                      {user.email}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <RoleBadge roles={roles} code={user.role} />
                  </td>
                  <td
                    className="truncate px-3 py-2 text-tx-secondary"
                    title={user.areaName ?? undefined}
                  >
                    {user.areaName ?? <span className="text-tx-secondary/50">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadges user={user} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-0.5">
                      {user.isActive && !user.lastLoginAt && (
                        <button
                          type="button"
                          title="Reenviar convite por e-mail"
                          aria-label={`Reenviar convite para ${user.fullName}`}
                          disabled={invitingId === user.id}
                          onClick={() => void handleSendInvite(user)}
                          className="grid h-7 w-7 place-items-center rounded-[7px] text-tx-secondary transition-colors hover:bg-bg-s3 hover:text-primary disabled:opacity-50"
                        >
                          <Mail className="h-[15px] w-[15px]" aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Editar"
                        aria-label={`Editar ${user.fullName}`}
                        onClick={(event) => {
                          rememberOpener(event.currentTarget);
                          openEdit(user);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-[7px] text-tx-secondary transition-colors hover:bg-bg-s3 hover:text-primary"
                      >
                        <Pencil className="h-[15px] w-[15px]" aria-hidden />
                      </button>
                      {user.isActive && (
                        <button
                          type="button"
                          title="Desativar"
                          aria-label={`Desativar ${user.fullName}`}
                          onClick={() => setConfirmDeactivateId(user.id)}
                          className="grid h-7 w-7 place-items-center rounded-[7px] text-tx-secondary transition-colors hover:bg-rose-100 hover:text-rose-800"
                        >
                          <UserX className="h-[15px] w-[15px]" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="subtle" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </Button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="subtle"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próximo →
          </Button>
        </div>
      )}

      {/* Confirm deactivate dialog */}
      {confirmDeactivateId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-sm grid gap-4">
            <h2 className="text-lg font-extrabold">Desativar usuário?</h2>
            <p className="text-sm text-tx-secondary">
              O usuário perderá o acesso imediatamente. Esta ação pode ser revertida editando o
              cadastro.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="subtle" size="sm" onClick={() => setConfirmDeactivateId(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={submitting}
                onClick={async () => {
                  await handleDeactivate(confirmDeactivateId);
                  setConfirmDeactivateId(null);
                }}
              >
                {submitting ? 'Desativando...' : 'Confirmar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Convidar / editar: desliza sobre cabeçalho + lista (overlay do AdminModal) */}
      <AdminModalOverlay open={visible}>
        {rendered ? (
          <UserFormPanel
            key={rendered.seq}
            panel={rendered.panel}
            visible={visible}
            submitting={submitting}
            error={panel ? error : null}
            invitingId={invitingId}
            onClose={closePanel}
            onCreate={(p) => onCreate(p)}
            onUpdate={(id, p) => void onUpdate(id, p)}
            onSendInvite={(user) => void handleSendInvite(user)}
          />
        ) : null}
      </AdminModalOverlay>
    </section>
  );
}
