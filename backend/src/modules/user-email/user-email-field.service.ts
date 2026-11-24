import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { FormFieldEntity, FormVersionEntity, UserEntity } from '../../database/entities';
import {
  normalizeEmail,
  parseUserEmailSuggestions,
  type PublicUserEmailSuggestions,
  type SuggestedUser,
  USER_SEARCH_LIMIT,
  USER_SEARCH_MIN_CHARS,
  withoutUserSuggestions,
} from './user-email-suggestions';

type FieldLike = {
  id: string;
  fieldType: string;
  settingsJson: Record<string, unknown> | null;
};

/** Um valor a conferir: `key` é o que vai no erro (código do campo no envio, rótulo na fase). */
export type UserEmailCheck = {
  key: string;
  fieldType: string;
  settingsJson: Record<string, unknown> | null;
  value: string | null | undefined;
};

export const NOT_SUGGESTED_MESSAGE = 'Escolha um dos e-mails sugeridos.';

/** Pares para translate() no Postgres: letra acentuada → sem acento (mesma posição). */
const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuuc';

/**
 * Campo "E-mail de usuário" (E-mail com sugestões de usuários do sistema). Ver
 * `user-email-suggestions.ts` para a configuração.
 */
@Injectable()
export class UserEmailFieldService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepo: Repository<FormVersionEntity>,
    @InjectRepository(FormFieldEntity)
    private readonly fieldsRepo: Repository<FormFieldEntity>,
  ) {}

  /**
   * Configuração pública de cada campo "E-mail de usuário" da versão: sai a lista de ids, entra
   * nome + e-mail das pessoas escolhidas (só as ativas). Campo que não é desse tipo não aparece.
   */
  async publicSettingsByField(fields: FieldLike[]): Promise<Map<string, Record<string, unknown>>> {
    const configured = fields
      .filter((field) => field.fieldType === FormFieldType.EMAIL)
      .map((field) => ({ field, suggestions: parseUserEmailSuggestions(field.settingsJson) }))
      .filter((entry) => entry.suggestions !== null);
    const result = new Map<string, Record<string, unknown>>();
    if (configured.length === 0) return result;

    const allIds = [...new Set(configured.flatMap((entry) => entry.suggestions?.userIds ?? []))];
    const users = allIds.length > 0 ? await this.activeUsersByIds(allIds) : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    for (const { field, suggestions } of configured) {
      if (!suggestions) continue;
      const publicSuggestions: PublicUserEmailSuggestions = {
        onlySuggested: suggestions.onlySuggested,
      };
      if (suggestions.userIds.length > 0) {
        publicSuggestions.users = sortByName(
          suggestions.userIds.flatMap((id) => {
            const user = byId.get(id);
            return user ? [toSuggested(user)] : [];
          }),
        );
      }
      result.set(field.id, {
        ...withoutUserSuggestions(field.settingsJson),
        userSuggestions: publicSuggestions,
      });
    }
    return result;
  }

  /**
   * Pesquisa de quem preenche o formulário publicado. Campo com pessoas escolhidas: filtra só
   * entre elas. Sem pessoas: pesquisa os usuários ativos pelo nome ou e-mail, com mínimo de
   * letras e teto de resultados — a rota é pública, não pode virar listagem de todo mundo.
   */
  async searchField(formId: string, fieldCode: string, q: string): Promise<{ users: SuggestedUser[] }> {
    const field = await this.findPublishedField(formId, fieldCode);
    const suggestions = parseUserEmailSuggestions(field.settingsJson);
    if (!suggestions) {
      throw new NotFoundException('Campo de e-mail de usuário não encontrado neste formulário.');
    }

    const text = q.trim();
    if (suggestions.userIds.length > 0) {
      const users = sortByName((await this.activeUsersByIds(suggestions.userIds)).map(toSuggested));
      const needle = normalizeSearch(text);
      return {
        users: needle
          ? users.filter(
              (user) =>
                normalizeSearch(user.name).includes(needle) ||
                normalizeSearch(user.email).includes(needle),
            )
          : users,
      };
    }

    if (text.length < USER_SEARCH_MIN_CHARS) {
      throw new BadRequestException(`Digite pelo menos ${USER_SEARCH_MIN_CHARS} caracteres.`);
    }
    // Sem a extensão unaccent no banco: tira os acentos do nome com translate() e do termo aqui.
    const term = `%${normalizeSearch(text).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const users = await this.usersRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.fullName', 'user.email'])
      .where('user.isActive = true')
      .andWhere(
        `(translate(LOWER(user.fullName), :accented, :plain) LIKE :term ESCAPE '\\' OR LOWER(user.email) LIKE :term ESCAPE '\\')`,
        { term, accented: ACCENTED, plain: PLAIN },
      )
      .orderBy('user.fullName', 'ASC')
      .limit(USER_SEARCH_LIMIT)
      .getMany();
    return { users: users.map(toSuggested) };
  }

  /**
   * Erros dos campos "E-mail de usuário" com `onlySuggested` cujo valor não é de alguém que pode
   * ser sugerido (ativo e, se o campo tem pessoas escolhidas, uma delas). Vazio = tudo certo.
   * Campo vazio não é conferido aqui (obrigatoriedade é com quem chama).
   */
  async findNotSuggested(checks: UserEmailCheck[]): Promise<Record<string, string>> {
    const pending = checks.flatMap((check) => {
      if (check.fieldType !== FormFieldType.EMAIL) return [];
      const suggestions = parseUserEmailSuggestions(check.settingsJson);
      const email = typeof check.value === 'string' ? normalizeEmail(check.value) : '';
      if (!suggestions?.onlySuggested || !email) return [];
      return [{ check, suggestions, email }];
    });
    const errors: Record<string, string> = {};
    if (pending.length === 0) return errors;

    const emails = [...new Set(pending.map((entry) => entry.email))];
    const users = await this.usersRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.email'])
      .where('user.isActive = true')
      .andWhere('LOWER(user.email) IN (:...emails)', { emails })
      .getMany();
    const idsByEmail = new Map<string, Set<string>>();
    for (const user of users) {
      const key = normalizeEmail(user.email);
      const ids = idsByEmail.get(key) ?? new Set<string>();
      ids.add(user.id);
      idsByEmail.set(key, ids);
    }

    for (const { check, suggestions, email } of pending) {
      const ids = idsByEmail.get(email);
      const allowed =
        !!ids &&
        (suggestions.userIds.length === 0 || suggestions.userIds.some((id) => ids.has(id)));
      if (!allowed) errors[check.key] = NOT_SUGGESTED_MESSAGE;
    }
    return errors;
  }

  private activeUsersByIds(ids: string[]): Promise<UserEntity[]> {
    return this.usersRepo.find({
      select: { id: true, fullName: true, email: true },
      where: { id: In(ids), isActive: true },
    });
  }

  private async findPublishedField(formId: string, fieldCode: string): Promise<FormFieldEntity> {
    const version = await this.versionsRepo.findOne({
      where: { formId, isPublished: true, form: { status: FormStatus.PUBLISHED } },
      select: { id: true },
    });
    const field = version
      ? await this.fieldsRepo.findOne({
          where: { formVersionId: version.id, code: fieldCode, fieldType: FormFieldType.EMAIL },
        })
      : null;
    if (!field) {
      throw new NotFoundException('Campo de e-mail de usuário não encontrado neste formulário.');
    }
    return field;
  }
}

function toSuggested(user: Pick<UserEntity, 'fullName' | 'email'>): SuggestedUser {
  return { name: user.fullName, email: user.email };
}

function sortByName(users: SuggestedUser[]): SuggestedUser[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
