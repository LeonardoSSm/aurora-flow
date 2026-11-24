import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { EmailBackgroundPicker } from '../../email-images/email-background-picker';
import { fetchScoreAlertBackground } from '../../email-images/email-images-api';
import type { FieldSettings, ScoreAlertRecipient, ScoreAlertSettings } from '../../forms/types';
import { scoreAlertProblem, scoreMarkOf } from '../lib/score-fields';

type UserMeta = { id: string; fullName: string; email: string };

const INPUT_CLASS =
  'h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary';

const CHANNELS: Array<{ value: NonNullable<ScoreAlertSettings['channel']>; label: string }> = [
  { value: 'email', label: 'E-mail' },
  { value: 'in_app', label: 'Aviso no sistema' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

/** Mesma lista de pessoas do nó "Notificação" dos fluxos (mesma chave de cache). */
function useAssignableUsers() {
  return useQuery({
    queryKey: ['panel-users', 'all'],
    queryFn: async () => {
      const { data } = await api.get<UserMeta[]>('/users/assignable', { params: undefined });
      return data;
    },
    staleTime: 60_000,
  });
}

/** Arte geral do aviso (Administração → Configurações → E-mails); null = a arte padrão. */
function useGeneralBackground() {
  return useQuery({ queryKey: ['email-images', 'score-alert-background'], queryFn: fetchScoreAlertBackground, staleTime: 60_000 });
}

function userIdsOf(recipients: ScoreAlertRecipient[]): string[] {
  return recipients.flatMap((recipient) => (recipient.type === 'users' ? recipient.userIds : []));
}

function customOf(recipients: ScoreAlertRecipient[]): string {
  return recipients.find((recipient) => recipient.type === 'custom')?.value ?? '';
}

function buildRecipients(userIds: string[], custom: string): ScoreAlertRecipient[] {
  return [
    ...(userIds.length > 0 ? [{ type: 'users' as const, userIds }] : []),
    ...(custom.trim() ? [{ type: 'custom' as const, value: custom }] : []),
  ];
}

function AlertDetails({
  alert,
  mark,
  labelFieldOptions,
  onChange,
}: {
  alert: ScoreAlertSettings;
  mark: number;
  labelFieldOptions: Array<{ code: string; label: string }>;
  onChange: (patch: Partial<ScoreAlertSettings>) => void;
}) {
  const always = alert.trigger === 'always';
  const users = useAssignableUsers();
  const recipients = alert.recipients ?? [];
  const selected = new Set(userIdsOf(recipients));
  const custom = customOf(recipients);
  const channel = alert.channel ?? 'email';
  const problem = scoreAlertProblem(alert);
  const generalBackground = useGeneralBackground();

  return (
    <div className="grid gap-3 pl-6">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-tx-secondary">Quando enviar</legend>
        <label className="flex items-start gap-2 text-sm text-tx-primary">
          <input
            type="radio"
            className="mt-1"
            checked={always}
            onChange={() => onChange({ trigger: 'always' })}
          />
          <span>
            Sempre que o formulário for respondido
            <span className="block text-xs text-tx-secondary">
              Manda o resultado de toda auditoria, com o que ficou abaixo do limite em destaque.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-tx-primary">
          <input
            type="radio"
            className="mt-1"
            checked={!always}
            onChange={() => onChange({ trigger: 'below' })}
          />
          <span>Só quando algo ficar abaixo do esperado</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-tx-secondary">
          {always ? 'Destacar como abaixo' : 'Avisar quando'}
        </legend>
        <label className="flex items-start gap-2 text-sm text-tx-primary">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(alert.sectionsBelow)}
            onChange={(event) => onChange({ sectionsBelow: event.target.checked })}
          />
          <span>
            alguma seção ficar abaixo do limite
            <span className="block text-xs text-tx-secondary">
              Limite: o marco ({mark.toLocaleString('pt-BR')}%), ou o limite próprio da seção, quando
              ela tiver um.
            </span>
          </span>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm text-tx-primary">
          <input
            type="checkbox"
            checked={typeof alert.resultBelow === 'number'}
            onChange={(event) => onChange({ resultBelow: event.target.checked ? mark : null })}
          />
          este resultado ficar abaixo de
          <input
            type="number"
            min={0}
            max={100}
            aria-label="Avisar abaixo de (%)"
            disabled={typeof alert.resultBelow !== 'number'}
            value={typeof alert.resultBelow === 'number' ? alert.resultBelow : ''}
            onChange={(event) => {
              const value = Number(event.target.value.replace(',', '.'));
              if (event.target.value.trim() !== '' && Number.isFinite(value)) onChange({ resultBelow: value });
            }}
            className={`${INPUT_CLASS} w-24 disabled:opacity-60`}
          />
          %
        </label>
      </fieldset>

      <label className="grid max-w-[360px] gap-1 text-xs font-semibold text-tx-secondary">
        Identificar a auditoria por
        <select
          aria-label="Pergunta que identifica a auditoria"
          value={alert.labelFieldCode ?? ''}
          onChange={(event) => onChange({ labelFieldCode: event.target.value || null })}
          className={INPUT_CLASS}
        >
          <option value="">Nenhuma — usar o nome do formulário</option>
          {labelFieldOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="font-normal">A resposta (ex.: a unidade) vai no assunto e no topo da mensagem.</span>
      </label>

      <label className="grid max-w-[480px] gap-1 text-xs font-semibold text-tx-secondary">
        Assunto da mensagem
        <input
          aria-label="Assunto da mensagem"
          value={alert.subject ?? ''}
          maxLength={200}
          placeholder="Auditoria abaixo do esperado — {unidade}"
          onChange={(event) => onChange({ subject: event.target.value || null })}
          className={INPUT_CLASS}
        />
        <span className="font-normal">
          Use {'{unidade}'} para a resposta da pergunta acima (ex.: Checklist Biosseguridade - {'{unidade}'}).
          Em branco: &quot;Auditoria abaixo (ou dentro) do esperado — unidade&quot;.
        </span>
      </label>

      <label className="grid max-w-[260px] gap-1 text-xs font-semibold text-tx-secondary">
        Canal
        <select
          aria-label="Canal do aviso"
          value={channel}
          onChange={(event) => onChange({ channel: event.target.value as ScoreAlertSettings['channel'] })}
          className={INPUT_CLASS}
        >
          {CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-1.5">
        <span className="text-xs font-semibold text-tx-secondary">Quem recebe</span>
        {users.isLoading ? (
          <span className="text-xs text-tx-secondary">Carregando pessoas…</span>
        ) : (
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-[8px] border border-border-strong px-3 py-2">
            {(users.data ?? []).map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm text-tx-primary">
                <input
                  type="checkbox"
                  aria-label={`Avisar ${user.fullName}`}
                  checked={selected.has(user.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(user.id);
                    else next.delete(user.id);
                    onChange({ recipients: buildRecipients([...next], custom) });
                  }}
                />
                <span className="min-w-0 truncate">
                  {user.fullName} <span className="text-xs text-tx-secondary">{user.email}</span>
                </span>
              </label>
            ))}
            {users.data?.length === 0 ? (
              <span className="text-xs text-tx-secondary">Nenhuma pessoa disponível.</span>
            ) : null}
          </div>
        )}
        <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
          {channel === 'whatsapp' ? 'Outros telefones' : 'Outros e-mails'} (separados por vírgula)
          <input
            aria-label="Outros destinatários"
            value={custom}
            placeholder={channel === 'whatsapp' ? '85999990000' : 'qualidade@empresa.com.br'}
            onChange={(event) => onChange({ recipients: buildRecipients([...selected], event.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {channel === 'email' ? (
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold text-tx-secondary">Arte de fundo do e-mail</span>
          {generalBackground.isLoading ? (
            <span className="text-xs text-tx-secondary">Carregando…</span>
          ) : (
            <EmailBackgroundPicker
              value={alert.backgroundImageId ?? null}
              onChange={(imageId) => onChange({ backgroundImageId: imageId })}
              fallbackImageId={generalBackground.data ?? null}
              fallbackLabel={generalBackground.data ? 'a arte geral' : 'a arte padrão'}
            />
          )}
        </div>
      ) : null}

      {problem ? <p className="text-xs font-semibold text-error">{problem}</p> : null}
      <p className="text-xs text-tx-secondary">
        Uma mensagem por resposta, no envio, com as notas, o que ficou abaixo e o link da resposta.
      </p>
    </div>
  );
}

/**
 * "Resultado da pontuação" → "Avisar quando": no envio, avisa (e-mail, WhatsApp ou aviso no sistema)
 * quando alguma seção ficar abaixo do limite e/ou o resultado ficar abaixo de um mínimo — ou sempre
 * que o formulário for respondido, com o resultado da auditoria.
 */
export function ScoreAlertEditor({
  settings,
  labelFieldOptions = [],
  onChangeSettings,
}: {
  settings: FieldSettings;
  /** Perguntas que podem identificar a auditoria (ex.: a unidade). */
  labelFieldOptions?: Array<{ code: string; label: string }>;
  onChangeSettings: (settings: FieldSettings) => void;
}) {
  const alert = settings.scoreAlert ?? {};
  const update = (patch: Partial<ScoreAlertSettings>) =>
    onChangeSettings({ ...settings, scoreAlert: { ...alert, ...patch } });

  return (
    <section className="grid gap-3 rounded-[8px] border border-border-strong px-3 py-2.5">
      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={Boolean(alert.enabled)}
          onChange={(event) =>
            update(
              event.target.checked
                ? { enabled: true, sectionsBelow: alert.sectionsBelow ?? true, channel: alert.channel ?? 'email' }
                : { enabled: false },
            )
          }
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">Avisar sobre a pontuação</span>
          <span className="text-xs text-tx-secondary">
            Manda uma mensagem a quem você escolher assim que a resposta é enviada — sempre, ou só quando
            algo ficar abaixo do esperado.
          </span>
        </span>
      </label>
      {alert.enabled ? (
        <AlertDetails alert={alert} mark={scoreMarkOf(settings)} labelFieldOptions={labelFieldOptions} onChange={update} />
      ) : null}
    </section>
  );
}
