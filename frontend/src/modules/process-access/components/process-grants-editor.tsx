import { cn } from '../../../lib/cn';
import type {
  ProcessAccessCatalog,
  ProcessAccessPreset,
  ProcessGrants,
  ProcessPermissionDefinition,
} from '../services/process-access-api';

/** Os modelos e as caixinhas são comparados pelo conteúdo: mesma lista, mesmos escopos. */
function sameGrants(a: ProcessGrants, b: ProcessGrants): boolean {
  const keysA = Object.keys(a);
  return keysA.length === Object.keys(b).length && keysA.every((code) => a[code] === b[code]);
}

/** O modelo pronto que as caixinhas reproduzem, se algum. */
export function matchingPreset(grants: ProcessGrants, presets: ProcessAccessPreset[]): ProcessAccessPreset | null {
  return presets.find((preset) => sameGrants(preset.grants, grants)) ?? null;
}

/** Resumo de um vínculo em uma linha: o nome do modelo, ou quantas permissões. */
export function describeGrants(grants: ProcessGrants, presets: ProcessAccessPreset[]): string {
  const preset = matchingPreset(grants, presets);
  if (preset) return preset.label;
  const count = Object.keys(grants).length;
  if (count === 0) return 'Só vê o processo';
  return `Personalizado · ${count} permiss${count === 1 ? 'ão' : 'ões'}`;
}

function groupsOf(permissions: ProcessPermissionDefinition[]): Array<[string, ProcessPermissionDefinition[]]> {
  const groups = new Map<string, ProcessPermissionDefinition[]>();
  for (const permission of permissions) {
    groups.set(permission.group, [...(groups.get(permission.group) ?? []), permission]);
  }
  return [...groups];
}

type ProcessGrantsEditorProps = {
  catalog: ProcessAccessCatalog;
  value: ProcessGrants;
  onChange: (grants: ProcessGrants) => void;
  disabled?: boolean;
};

/**
 * O que uma pessoa pode num processo: um modelo pronto como ponto de partida e as caixinhas por
 * grupo, que podem mudar depois. Ter o vínculo já é ver o processo — nada marcado = só vê.
 */
export function ProcessGrantsEditor({ catalog, value, onChange, disabled = false }: ProcessGrantsEditorProps) {
  const preset = matchingPreset(value, catalog.presets);

  function toggle(permission: ProcessPermissionDefinition, checked: boolean) {
    const next = { ...value };
    if (checked) next[permission.code] = permission.scopes[0] ?? 'all';
    else delete next[permission.code];
    onChange(next);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-tx-muted">Modelo</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modelo de acesso">
          {catalog.presets.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={preset?.key === option.key}
              disabled={disabled}
              title={option.description}
              onClick={() => onChange({ ...option.grants })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60',
                preset?.key === option.key
                  ? 'border-primary bg-primary/10 text-primary dark:text-blue-300'
                  : 'border-border-default text-tx-secondary hover:bg-bg-hover',
              )}
            >
              {option.label}
            </button>
          ))}
          <span
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-bold',
              preset ? 'border-transparent text-tx-muted' : 'border-primary bg-primary/10 text-primary dark:text-blue-300',
            )}
          >
            Personalizado
          </span>
        </div>
        {preset ? <p className="text-xs text-tx-muted">{preset.description}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {groupsOf(catalog.permissions).map(([group, permissions]) => (
          <fieldset key={group} className="grid content-start gap-1.5 rounded-[10px] border border-border-default p-3">
            <legend className="px-1 text-xs font-bold text-tx-primary">{group}</legend>
            {permissions.map((permission) => {
              const scope = value[permission.code];
              const checked = scope !== undefined;
              return (
                <div key={permission.code} className="grid gap-1">
                  <label className="flex cursor-pointer items-start gap-2 text-[13px] font-medium text-tx-secondary">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => toggle(permission, event.target.checked)}
                    />
                    <span>{permission.label}</span>
                  </label>
                  {checked && permission.scopes.length > 1 ? (
                    <div className="ml-6 flex gap-1" role="radiogroup" aria-label={`Alcance de ${permission.label}`}>
                      {permission.scopes.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={scope === option}
                          disabled={disabled}
                          onClick={() => onChange({ ...value, [permission.code]: option })}
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[11.5px] font-bold transition-colors',
                            scope === option ? 'bg-primary/15 text-primary dark:text-blue-300' : 'text-tx-muted hover:bg-bg-hover',
                          )}
                        >
                          {option === 'all' ? 'Todas' : 'Só as minhas'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
