import { FormFieldType } from '../enums/form-field-type.enum';
import type { SubmissionEntity, SubmissionItemEntity } from '../../database/entities';
import { parseUserEmailSuggestions } from '../../modules/user-email/user-email-suggestions';

export interface RequesterContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

const NAME_FIELD_TYPES = new Set<FormFieldType>([FormFieldType.SHORT_TEXT, FormFieldType.LONG_TEXT]);
const NAME_LABEL_PATTERN = /nome/i;

/**
 * Rótulos que dizem que o dado é de OUTRA pessoa ("E-mail Gestor Imediato", "Telefone do
 * supervisor", "Nome do aprovador"). Nunca viram contato do solicitante.
 */
const THIRD_PARTY_LABEL_PATTERN =
  /\b(gestor|gestora|gerente|supervisor|supervisora|chefe|coordenador|coordenadora|diretor|diretora|lider|aprovador|aprovadora|superior|encarregado|encarregada|responsavel)\b/;

/** Rótulos que dizem que o dado é de quem preenche ("Seu E-mail", "E-mail do solicitante"). */
const SELF_LABEL_PATTERN = /\b(seu|sua|meu|minha|solicitante|requerente|respondente)\b/;

function normalizeLabel(label: string | null | undefined): string {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Entre os itens já filtrados, fica com o que parece ser do próprio solicitante: descarta os
 * de terceiros e, entre os que sobram, prefere o rótulo "seu/do solicitante" ao neutro. Em
 * empate, vale a ordem dos itens.
 */
function pickRequesterItem(
  items: SubmissionItemEntity[],
  matches: (item: SubmissionItemEntity) => boolean,
): SubmissionItemEntity | undefined {
  let neutral: SubmissionItemEntity | undefined;
  for (const item of items) {
    if (!item.field || !item.valueText?.trim() || !matches(item)) continue;
    const label = normalizeLabel(item.field.label);
    if (THIRD_PARTY_LABEL_PATTERN.test(label)) continue;
    // "E-mail de usuário" (sugere gente do sistema) é de outra pessoa, salvo rótulo "seu e-mail".
    if (parseUserEmailSuggestions(item.field.settingsJson) && !SELF_LABEL_PATTERN.test(label)) continue;
    if (SELF_LABEL_PATTERN.test(label)) return item;
    neutral ??= item;
  }
  return neutral;
}

/**
 * Best-effort contact info for whoever filled out a form submission. Public
 * forms rarely have an identified responder (SubmissionEntity.responderName/
 * responderEmail stay null — see "Respondente sem identificação" in the
 * Respostas module), even though the form itself usually asks for name/
 * email/phone as regular questions. This pulls those from the submission's
 * own answers so the Solicitação panel isn't stuck showing "-".
 *
 * Email and phone match by field TYPE (EMAIL/PHONE) — reliable regardless of
 * how the field happens to be coded. Name has no dedicated field type, so it
 * falls back to a label heuristic (contains "nome"); if nothing matches, it
 * stays null rather than guessing the wrong field.
 *
 * Forms often ask for someone else's contact too ("E-mail Gestor Imediato"
 * before "Seu E-mail"): fields labeled as a third party are skipped, and a
 * field labeled as the responder's own wins over a neutral one.
 *
 * Requires `submission.items.field` to be loaded — returns nulls otherwise.
 */
export function extractRequesterContact(
  submission: SubmissionEntity | null | undefined,
): RequesterContact {
  const items = submission?.items ?? [];

  const emailItem = pickRequesterItem(items, (item) => item.field.fieldType === FormFieldType.EMAIL);
  const phoneItem = pickRequesterItem(items, (item) => item.field.fieldType === FormFieldType.PHONE);
  const nameItem = pickRequesterItem(
    items,
    (item) =>
      NAME_FIELD_TYPES.has(item.field.fieldType) && NAME_LABEL_PATTERN.test(item.field.label),
  );

  return {
    name: submission?.responderName ?? nameItem?.valueText?.trim() ?? null,
    email: submission?.responderEmail ?? emailItem?.valueText?.trim() ?? null,
    phone: phoneItem?.valueText?.trim() ?? null,
  };
}
