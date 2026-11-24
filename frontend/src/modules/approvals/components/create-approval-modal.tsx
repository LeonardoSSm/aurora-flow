import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, FieldLabel, TextInput, useToast } from '../../../components/ui';
import { MAX_EXTERNAL_APPROVERS, parseEmailList } from '../../../lib/email-list';
import { queryKeys } from '../../../lib/query-keys';
import { useRoleOptionsQuery } from '../../admin/hooks/use-roles';
import { fetchAssignableUsers } from '../../users/services/users-api';
import { useCreateApprovalMutation } from '../hooks/use-create-approval-mutation';
import { ApprovalModalShell } from './approval-modal-shell';
import { getApiErrorMessage } from './approval-modal-utils';
import { approverKeys, ApproversField, type ApprovalRule, type ApproverSelection } from './approvers-field';

type CreateApprovalModalProps = {
  solicitationId: string;
  onClose: () => void;
};

export function CreateApprovalModal({ solicitationId, onClose }: CreateApprovalModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const mutation = useCreateApprovalMutation(solicitationId);
  const usersQuery = useQuery({
    queryKey: ['users', 'assignable', 'approvals.decide'],
    queryFn: () => fetchAssignableUsers('approvals.decide'),
  });
  const rolesQuery = useRoleOptionsQuery();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selection, setSelection] = useState<ApproverSelection>({ roleCodes: [], userIds: [] });
  const [rule, setRule] = useState<ApprovalRule>('any');
  const [externalText, setExternalText] = useState('');
  const [formError, setFormError] = useState('');
  const [apiError, setApiError] = useState('');

  const external = useMemo(() => parseEmailList(externalText), [externalText]);
  const roleOptions = useMemo(
    () => (rolesQuery.data ?? []).map((role) => ({ value: role.code, label: role.name })),
    [rolesQuery.data],
  );
  const userOptions = useMemo(
    () => (usersQuery.data ?? []).map((user) => ({ value: user.id, label: user.fullName, hint: user.email })),
    [usersQuery.data],
  );

  function handleSubmit() {
    setFormError('');
    setApiError('');

    if (!title.trim()) {
      setFormError('Titulo e obrigatorio.');
      return;
    }
    if (external.invalid.length > 0) {
      setFormError(`E-mail inválido: ${external.invalid.join(', ')}.`);
      return;
    }
    if (external.emails.length > MAX_EXTERNAL_APPROVERS) {
      setFormError(`No máximo ${MAX_EXTERNAL_APPROVERS} aprovadores por e-mail.`);
      return;
    }
    if (selection.userIds.length + selection.roleCodes.length === 0 && external.emails.length === 0) {
      setFormError('Selecione pelo menos um aprovador.');
      return;
    }

    mutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        assignedUserIds: selection.userIds,
        ...(selection.roleCodes.length > 0 ? { assignedRoleCodes: selection.roleCodes } : {}),
        ...(external.emails.length > 0 ? { assignedEmails: external.emails } : {}),
        mode: rule === 'sequential' ? 'sequential' : 'parallel',
        ...(rule !== 'any' ? { requireAll: true } : {}),
        // Em ordem: a fila escolhida; os e-mails vão no fim.
        ...(rule === 'sequential'
          ? { assigneeOrder: [...approverKeys(selection), ...external.emails.map((email) => `email:${email}`)] }
          : {}),
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.approvals.bySolicitation(solicitationId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.solicitations.kanbanBoard(),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.solicitations.byId(solicitationId),
          });
          void queryClient.invalidateQueries({ queryKey: ['solicitations', solicitationId] });
          showToast({ title: 'Aprovacao criada', variant: 'success' });
          onClose();
        },
        onError: (error) => {
          setApiError(getApiErrorMessage(error, 'Nao foi possivel criar a aprovacao.'));
        },
      },
    );
  }

  return (
    <ApprovalModalShell
      title="Nova aprovacao"
      description="Defina o titulo, quem decide (perfis e usuarios) e a regra da aprovacao."
      onClose={onClose}
      closeDisabled={mutation.isPending}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="subtle"
            size="sm"
            className="min-h-11 sm:min-h-0"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="min-h-11 sm:min-h-0"
            onClick={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Criando...' : 'Criar aprovacao'}
          </Button>
        </div>
      }
    >
      <FieldLabel>
        Titulo
        <TextInput
          value={title}
          maxLength={180}
          placeholder="Ex: Aprovar compra de equipamento"
          onChange={(event) => setTitle(event.target.value)}
        />
      </FieldLabel>

      <FieldLabel>
        Descricao
        <textarea
          value={description}
          rows={3}
          placeholder="Contexto adicional para os aprovadores"
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-base text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2 sm:text-sm"
        />
      </FieldLabel>

      <div className="grid gap-1.5">
        <p className="text-sm font-medium text-tx-primary">Aprovadores e regra</p>
        <ApproversField
          value={selection}
          onChange={setSelection}
          rule={rule}
          onRuleChange={setRule}
          roleOptions={roleOptions}
          userOptions={userOptions}
          usersLoading={usersQuery.isLoading}
        />
        <p className="text-xs text-tx-secondary">
          Um perfil conta como um aprovador: basta uma pessoa do perfil decidir.
        </p>
      </div>

      <FieldLabel>
        Aprovadores por e-mail (opcional)
        <textarea
          value={externalText}
          rows={2}
          aria-label="Aprovadores por e-mail"
          placeholder="gestor@empresa.com, outro@empresa.com"
          onChange={(event) => setExternalText(event.target.value)}
          className="w-full rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-base text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2 sm:text-sm"
        />
        <span className="mt-1 block text-xs font-normal text-tx-secondary">
          Quem não tem usuário no sistema recebe um link pessoal por e-mail e decide por ele, sem
          login. Quem já tem usuário ativo decide dentro do sistema. Separe por vírgula ou linha.
          {rule === 'sequential' ? ' Em ordem, os e-mails aprovam depois dos escolhidos acima.' : ''}
        </span>
        {external.invalid.length > 0 ? (
          <span className="mt-1 block text-xs font-semibold text-red-600">
            E-mail inválido: {external.invalid.join(', ')}
          </span>
        ) : null}
      </FieldLabel>

      {rule === 'sequential' && external.emails.length > 0 ? (
        <ol className="grid grid-cols-1 gap-1" aria-label="E-mails na ordem de aprovação">
          {external.emails.map((email, i) => (
            <li
              key={email}
              className="flex items-center gap-2 rounded-lg border border-border-default/60 bg-surface-container-low px-3 py-1.5 text-sm"
            >
              <span className="w-5 shrink-0 font-bold text-primary">
                {approverKeys(selection).length + i + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate text-tx-primary">{email} (por e-mail)</span>
            </li>
          ))}
        </ol>
      ) : null}

      {formError || apiError ? (
        <p className="break-words rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {apiError || formError}
        </p>
      ) : null}
    </ApprovalModalShell>
  );
}
