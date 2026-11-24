import { useQuery } from '@tanstack/react-query';
import {
  erpLookupKeys,
  fetchErpLookupConnectors,
  fetchErpLookupSources,
} from '../../erp-lookup/erp-lookup-api';
import type { FieldSettings } from '../../forms/types';
import { ERP_LOOKUP_MIN_CHARS_DEFAULT } from '../types';

const labelCls = 'grid gap-2 text-xs font-semibold text-tx-secondary';
const inputCls =
  'h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';

/**
 * Configuração de um campo "Lista do ERP": de qual conector (API erp-lookup) e de qual lista as
 * opções vêm. O modo (lista ou pesquisa) vem da própria lista, definida na API.
 */
export function ErpLookupSettingsEditor({
  settings,
  onChange,
}: {
  settings: FieldSettings;
  onChange: (next: FieldSettings) => void;
}) {
  const connectorId = settings.erpConnectorId ?? '';
  const connectors = useQuery({
    queryKey: erpLookupKeys.connectors(),
    queryFn: fetchErpLookupConnectors,
    staleTime: 60_000,
  });
  const sources = useQuery({
    queryKey: erpLookupKeys.sources(connectorId),
    queryFn: () => fetchErpLookupSources(connectorId),
    enabled: connectorId.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const modo = settings.modo ?? 'pesquisa';
  const selectedSourceMissing =
    !!settings.fonte && !!sources.data && !sources.data.some((source) => source.id === settings.fonte);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className={labelCls}>
        Conector de ERP
        <select
          value={connectorId}
          disabled={connectors.isLoading}
          onChange={(event) =>
            onChange({ ...settings, erpConnectorId: event.target.value || undefined, fonte: undefined })
          }
          className={inputCls}
        >
          <option value="">{connectors.isLoading ? 'Carregando…' : 'Escolha o conector'}</option>
          {connectors.data?.map((connector) => (
            <option key={connector.id} value={connector.id}>
              {connector.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelCls}>
        Lista
        <select
          value={settings.fonte ?? ''}
          disabled={!connectorId || sources.isLoading || sources.isError}
          onChange={(event) => {
            const source = sources.data?.find((item) => item.id === event.target.value);
            onChange({ ...settings, fonte: source?.id, modo: source?.modo ?? settings.modo });
          }}
          className={inputCls}
        >
          <option value="">
            {!connectorId ? 'Escolha o conector primeiro' : sources.isLoading ? 'Carregando…' : 'Escolha a lista'}
          </option>
          {sources.data?.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
          {selectedSourceMissing ? (
            <option value={settings.fonte}>{settings.fonte} (não existe mais na API)</option>
          ) : null}
        </select>
      </label>

      {connectors.isError ? (
        <p className="text-xs text-error md:col-span-2">Não foi possível carregar os conectores de ERP.</p>
      ) : null}
      {connectors.data?.length === 0 ? (
        <p className="text-xs text-tx-muted md:col-span-2">
          Nenhum conector de ERP ativo. Cadastre a API de consultas em Administração → ERP.
        </p>
      ) : null}
      {sources.isError ? (
        <p className="text-xs text-error md:col-span-2">
          Não foi possível buscar as listas desse conector. Confira o conector em Administração → ERP
          (&quot;Testar conexão&quot;).
        </p>
      ) : null}
      {sources.data?.length === 0 ? (
        <p className="text-xs text-tx-muted md:col-span-2">Esse conector ainda não tem nenhuma lista.</p>
      ) : null}
      {selectedSourceMissing ? (
        <p className="text-xs text-error md:col-span-2">
          A lista escolhida não existe mais na API do ERP. Escolha outra antes de publicar.
        </p>
      ) : null}

      {settings.fonte ? (
        <p className="text-xs text-tx-muted md:col-span-2">
          {modo === 'lista'
            ? 'Lista curta: as opções aparecem todas ao abrir o campo.'
            : 'Lista grande: quem responde digita para pesquisar.'}
        </p>
      ) : null}

      {modo === 'pesquisa' ? (
        <label className={labelCls}>
          Mínimo de caracteres para pesquisar
          <input
            type="number"
            min={2}
            max={20}
            value={settings.minCaracteres ?? ERP_LOOKUP_MIN_CHARS_DEFAULT}
            onChange={(event) => {
              const next = Math.min(20, Math.max(2, Number(event.target.value) || 2));
              onChange({ ...settings, minCaracteres: next });
            }}
            className={inputCls}
          />
        </label>
      ) : null}

      <label className={labelCls}>
        Texto de ajuda dentro do campo
        <input
          type="text"
          maxLength={120}
          value={settings.placeholder ?? ''}
          placeholder="Ex.: Busque por nome ou código"
          onChange={(event) => onChange({ ...settings, placeholder: event.target.value || undefined })}
          className={inputCls}
        />
      </label>

      <label className="flex items-start gap-2 text-xs font-semibold text-tx-secondary md:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={settings.exigirLogin === true}
          onChange={(event) => onChange({ ...settings, exigirLogin: event.target.checked })}
        />
        <span>
          Exigir login para pesquisar
          <span className="block font-normal text-tx-muted">
            Desmarcado, qualquer pessoa com o link do formulário consegue pesquisar nesta lista.
          </span>
        </span>
      </label>
    </div>
  );
}
