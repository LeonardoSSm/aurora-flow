import { Building2, Link2, Save, Shield } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { EmailBackgroundPicker } from '../../email-images/email-background-picker';
import { AdminModalFooter } from '../components/admin-modal-context';
import { useSettingsQuery, useUpdateAllSettingsMutation } from '../hooks/use-settings';
import type { AppSetting } from '../services/admin-api';

// ─── Static tab/field config ─────────────────────────────────────────────────

export type SettingsFieldDef =
  | { key: string; label: string; type: 'text' | 'email' }
  | { key: string; label: string; type: 'number'; min?: number; max?: number }
  | { key: string; label: string; type: 'boolean' }
  /** Imagem dos e-mails: o valor é o id da imagem enviada (vazio = a arte padrão). */
  | { key: string; label: string; type: 'email_image'; help: string };

export type SettingsTabDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  fields: SettingsFieldDef[];
};

/**
 * Abas de Configuracoes. A nav lateral do modal usa a mesma lista para os
 * subitens (rotulos) e para a busca (rotulos dos campos: "senha" acha Seguranca).
 */
export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: 'organization',
    label: 'Organização',
    icon: Building2,
    fields: [
      { key: 'org.name', label: 'Nome da Organização', type: 'text' },
      { key: 'org.support_email', label: 'E-mail de suporte', type: 'email' },
    ],
  },
  {
    id: 'security',
    label: 'Segurança',
    icon: Shield,
    fields: [
      {
        key: 'security.password_min_length',
        label: 'Tamanho mínimo de senha',
        type: 'number',
        min: 6,
        max: 32,
      },
      {
        key: 'security.session_timeout_hours',
        label: 'Expiração de sessão (horas)',
        type: 'number',
        min: 1,
        max: 168,
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Link2,
    fields: [
      {
        key: 'integrations.google_sheets_enabled',
        label: 'Google Sheets habilitado',
        type: 'boolean',
      },
    ],
  },
];

/** Aba ativa vem da URL (`?aba=security`); sem ela, ou invalida, a primeira. */
export const SETTINGS_TAB_PARAM = 'aba';

export function resolveSettingsTab(search: string): SettingsTabDef {
  const id = new URLSearchParams(search).get(SETTINGS_TAB_PARAM);
  return SETTINGS_TABS.find((t) => t.id === id) ?? SETTINGS_TABS[0];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateField(field: SettingsFieldDef, value: string): string | null {
  if (field.type === 'number') {
    const n = Number(value);
    if (value.trim() === '' || isNaN(n) || !isFinite(n)) return 'Deve ser um número válido.';
    if ('min' in field && field.min !== undefined && n < field.min)
      return `Valor mínimo permitido: ${field.min}.`;
    if ('max' in field && field.max !== undefined && n > field.max)
      return `Valor máximo permitido: ${field.max}.`;
  }
  if (field.type === 'email' && value.trim() !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Informe um e-mail válido.';
  }
  return null;
}

function validateAll(
  fields: SettingsFieldDef[],
  localValues: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const val = localValues[field.key] ?? '';
    const err = validateField(field, val);
    if (err) errors[field.key] = err;
  }
  return errors;
}

// ─── Draft state ──────────────────────────────────────────────────────────────

type State = {
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  errors: Record<string, string>;
  initialized: boolean;
};

type Action =
  | { type: 'INIT'; serverValues: Record<string, string> }
  | { type: 'CHANGE'; key: string; value: string; serverValue: string; fieldError: string | null }
  | { type: 'CLEAR_DIRTY' }
  | { type: 'RESET'; serverValues: Record<string, string> }
  | { type: 'SET_ERRORS'; errors: Record<string, string> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT':
      if (state.initialized) return state;
      return { ...state, localValues: action.serverValues, initialized: true };
    case 'CHANGE': {
      const newDirty = new Set(state.dirtyKeys);
      if (action.value === action.serverValue) {
        newDirty.delete(action.key);
      } else {
        newDirty.add(action.key);
      }
      const newErrors = { ...state.errors };
      if (action.fieldError) {
        newErrors[action.key] = action.fieldError;
      } else {
        delete newErrors[action.key];
      }
      return {
        ...state,
        localValues: { ...state.localValues, [action.key]: action.value },
        dirtyKeys: newDirty,
        errors: newErrors,
      };
    }
    case 'CLEAR_DIRTY':
      return { ...state, dirtyKeys: new Set<string>(), errors: {} };
    case 'RESET':
      return {
        ...state,
        localValues: action.serverValues,
        dirtyKeys: new Set<string>(),
        errors: {},
      };
    case 'SET_ERRORS':
      return { ...state, errors: action.errors };
    default:
      return state;
  }
}

type SettingsDraftValue = {
  state: State;
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  change: (field: SettingsFieldDef, rawValue: string) => void;
  toggle: (field: SettingsFieldDef, checked: boolean) => void;
  discard: () => void;
  /** Salva todas as abas; com erro, devolve a primeira aba que tem erro. */
  saveAll: () => SettingsTabDef | null;
};

const SettingsDraftContext = createContext<SettingsDraftValue | null>(null);

export function useSettingsDraft(): SettingsDraftValue {
  const value = useContext(SettingsDraftContext);
  if (!value) throw new Error('useSettingsDraft precisa de um SettingsDraftProvider.');
  return value;
}

/** Versao opcional para quem so pinta indicadores (nav lateral do modal). */
export function useOptionalSettingsDraft(): SettingsDraftValue | null {
  return useContext(SettingsDraftContext);
}

/**
 * Rascunho de Configuracoes, montado no modal de Administracao para sobreviver a
 * troca de aba/secao e alimentar os pontos ambar (alterado) e vermelho (erro)
 * da nav lateral. `enabled` adia a busca ate a secao ser aberta pela 1a vez.
 */
export function SettingsDraftProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const { data: settings, isLoading, isError } = useSettingsQuery({ enabled });
  const mutation = useUpdateAllSettingsMutation();
  const { showToast } = useToast();

  const [state, dispatch] = useReducer(reducer, {
    localValues: {},
    dirtyKeys: new Set<string>(),
    errors: {},
    initialized: false,
  });

  const serverValues = useMemo<Record<string, string>>(() => {
    if (!settings) return {};
    return Object.fromEntries(settings.map((s: AppSetting) => [s.key, s.value ?? '']));
  }, [settings]);

  useEffect(() => {
    if (settings && !state.initialized) {
      dispatch({ type: 'INIT', serverValues });
    }
  }, [settings, state.initialized, serverValues]);

  const change = useCallback(
    (field: SettingsFieldDef, rawValue: string) => {
      dispatch({
        type: 'CHANGE',
        key: field.key,
        value: rawValue,
        serverValue: serverValues[field.key] ?? '',
        fieldError: validateField(field, rawValue),
      });
    },
    [serverValues],
  );

  const toggle = useCallback(
    (field: SettingsFieldDef, checked: boolean) => {
      dispatch({
        type: 'CHANGE',
        key: field.key,
        value: checked ? 'true' : 'false',
        serverValue: serverValues[field.key] ?? '',
        fieldError: null,
      });
    },
    [serverValues],
  );

  const discard = useCallback(() => {
    dispatch({ type: 'RESET', serverValues });
  }, [serverValues]);

  const saveAll = useCallback((): SettingsTabDef | null => {
    const allFields = SETTINGS_TABS.flatMap((t) => t.fields);
    const errors = validateAll(allFields, state.localValues);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_ERRORS', errors });
      showToast({ title: 'Corrija os erros antes de salvar.', variant: 'error' });
      return SETTINGS_TABS.find((t) => t.fields.some((f) => errors[f.key])) ?? null;
    }

    const updates = Array.from(state.dirtyKeys).map((key) => ({
      key,
      value: state.localValues[key] ?? '',
    }));

    if (updates.length === 0) return null;

    mutation.mutate(updates, {
      onSuccess: () => {
        dispatch({ type: 'CLEAR_DIRTY' });
        showToast({ title: 'Configurações salvas com sucesso.', variant: 'success' });
      },
      onError: () => {
        showToast({ title: 'Erro ao salvar configurações.', variant: 'error' });
      },
    });
    return null;
  }, [mutation, showToast, state.dirtyKeys, state.localValues]);

  const value = useMemo<SettingsDraftValue>(
    () => ({
      state,
      isLoading: isLoading || (enabled && !state.initialized && !isError),
      isError,
      isSaving: mutation.isPending,
      change,
      toggle,
      discard,
      saveAll,
    }),
    [state, isLoading, enabled, isError, mutation.isPending, change, toggle, discard, saveAll],
  );

  return <SettingsDraftContext.Provider value={value}>{children}</SettingsDraftContext.Provider>;
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-bg-surface shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FieldSkeleton() {
  return (
    <div className="grid gap-2 animate-pulse">
      <div className="h-4 w-40 rounded bg-surface-container-high" />
      <div className="h-9 w-full rounded-lg bg-surface-container-high" />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AdminSettingsView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isLoading, isError, isSaving, change, toggle, discard, saveAll } =
    useSettingsDraft();

  const activeTabDef = resolveSettingsTab(location.search);
  const dirtyCount = state.dirtyKeys.size;
  const hasDirty = dirtyCount > 0;
  const hasErrors = Object.keys(state.errors).length > 0;

  function handleSaveAll() {
    const tabWithError = saveAll();
    if (tabWithError && tabWithError.id !== activeTabDef.id) {
      navigate(
        { search: `?${SETTINGS_TAB_PARAM}=${tabWithError.id}` },
        { replace: true, state: location.state },
      );
    }
  }

  return (
    <section className="grid gap-4">
      {isError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível carregar as configurações. Tente recarregar a página.
        </div>
      )}

      <div className="grid max-w-[520px] gap-5">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <FieldSkeleton key={i} />)
          : activeTabDef.fields.map((field) => {
              const value = state.localValues[field.key] ?? '';
              const error = state.errors[field.key];
              const isDirty = state.dirtyKeys.has(field.key);
              const inputId = `setting-${field.key}`;

              return (
                <div key={field.key} className="grid gap-1.5">
                  <label htmlFor={inputId} className="text-[13px] font-semibold text-tx-secondary">
                    {field.label}
                    {isDirty && (
                      <span className="ml-1.5 text-xs font-normal text-amber-500">(não salvo)</span>
                    )}
                  </label>

                  {field.type === 'email_image' ? (
                    <div className="grid gap-1.5">
                      <p className="text-xs text-tx-secondary">{field.help}</p>
                      <EmailBackgroundPicker
                        value={value || null}
                        onChange={(imageId) => change(field, imageId ?? '')}
                        fallbackImageId={null}
                        fallbackLabel="a arte padrão"
                      />
                    </div>
                  ) : field.type === 'boolean' ? (
                    <div className="flex items-center gap-3">
                      <Toggle checked={value === 'true'} onChange={(v) => toggle(field, v)} />
                      <span className="text-[13px] text-tx-secondary">
                        {value === 'true' ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                  ) : (
                    <input
                      id={inputId}
                      type={field.type === 'number' ? 'number' : field.type}
                      value={value}
                      min={field.type === 'number' && 'min' in field ? field.min : undefined}
                      max={field.type === 'number' && 'max' in field ? field.max : undefined}
                      aria-invalid={error ? true : undefined}
                      onChange={(e) => change(field, e.target.value)}
                      className={cn(
                        'h-9 w-full rounded-lg border px-3 text-[13px] text-tx-primary outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/15',
                        error
                          ? 'border-rose-400 bg-rose-50/50'
                          : isDirty
                            ? 'border-amber-400 bg-amber-50/40'
                            : 'border-border-default bg-bg-surface',
                      )}
                    />
                  )}

                  {error && <p className="text-xs text-rose-600">{error}</p>}
                  {!error && field.type === 'number' && 'min' in field && (
                    <p className="text-xs text-tx-muted">
                      {field.min !== undefined && field.max !== undefined
                        ? `Entre ${field.min} e ${field.max}`
                        : field.min !== undefined
                          ? `Mínimo: ${field.min}`
                          : ''}
                    </p>
                  )}
                </div>
              );
            })}
      </div>

      <AdminModalFooter>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-bg-surface py-3 pl-4 pr-4 md:pl-8 md:pr-5">
          <p className="text-[13px] text-tx-secondary">
            {hasDirty
              ? `${dirtyCount} campo${dirtyCount !== 1 ? 's' : ''} com alterações não salvas`
              : 'Sem alterações pendentes.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="subtle" size="sm" disabled={!hasDirty || isSaving} onClick={discard}>
              Descartar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!hasDirty || hasErrors || isSaving}
              onClick={handleSaveAll}
            >
              <Save size={14} className="mr-1.5 inline" />
              {isSaving ? 'Salvando...' : 'Salvar todas as alterações'}
            </Button>
          </div>
        </div>
      </AdminModalFooter>
    </section>
  );
}
