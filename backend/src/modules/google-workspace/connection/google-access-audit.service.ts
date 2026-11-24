import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { UserEntity } from '../../../database/entities';
import { GoogleConnectionService } from './google-connection.service';

/**
 * Escopos que o sistema precisa (ver GOOGLE_OAUTH_SCOPES): identidade + drive.file. O que vier além
 * disso (ex.: `spreadsheets`, `drive`) é acesso excedente de uma autorização antiga.
 */
export const ALLOWED_GOOGLE_SCOPES: ReadonlySet<string> = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]);

export type GoogleAccessAction =
  | 'ok'
  | 'would_revoke'
  | 'revoked'
  | 'would_clear_invalid'
  | 'cleared_invalid'
  | 'error';

export interface GoogleAccessAuditEntry {
  userId: string;
  email: string;
  action: GoogleAccessAction;
  /** Escopos concedidos além do necessário (vazio quando está tudo certo). */
  excessScopes: string[];
  error?: string;
}

export interface GoogleAccessAuditReport {
  /** `true` = só auditou, nada foi alterado. */
  dryRun: boolean;
  checked: number;
  /** Usuários com acesso além do necessário (a revogar ou já revogados). */
  withBroadAccess: number;
  revoked: number;
  /** Tokens já mortos/ilegíveis, limpos do banco. */
  clearedInvalid: number;
  ok: number;
  failed: number;
  users: GoogleAccessAuditEntry[];
}

type Inspection =
  | { kind: 'scopes'; scopes: string[] }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

/**
 * Auditoria e limpeza em massa das autorizações Google guardadas.
 *
 * Por quê: o Google não reduz o escopo de uma autorização que já existe. Quem conectou antes da troca
 * para `drive.file` segue com um refresh token que renova acesso a TODAS as suas planilhas — e o login
 * com Google não o substitui (o Google não emite refresh token novo sem novo consentimento).
 *
 * O que faz: para cada usuário com Google conectado, renova o token (a resposta do Google lista os
 * escopos concedidos). Se houver escopo além do necessário, desconecta o usuário — o que também
 * REVOGA o token no Google. No próximo "Conectar Google"/login o consentimento reaparece, agora só com
 * `drive.file`. Nunca devolve nem registra tokens.
 */
@Injectable()
export class GoogleAccessAuditService {
  private readonly logger = new Logger(GoogleAccessAuditService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenCipher: TokenCipherService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly connectionService: GoogleConnectionService,
  ) {}

  async run(options: { apply: boolean }): Promise<GoogleAccessAuditReport> {
    const users = await this.usersRepository.find({
      where: { googleRefreshToken: Not(IsNull()) },
      order: { email: 'ASC' },
    });

    const entries: GoogleAccessAuditEntry[] = [];
    for (const user of users) {
      entries.push(await this.process(user, options.apply));
    }

    const report: GoogleAccessAuditReport = {
      dryRun: !options.apply,
      checked: entries.length,
      withBroadAccess: entries.filter((e) => e.excessScopes.length > 0).length,
      revoked: entries.filter((e) => e.action === 'revoked').length,
      clearedInvalid: entries.filter((e) => e.action === 'cleared_invalid').length,
      ok: entries.filter((e) => e.action === 'ok').length,
      failed: entries.filter((e) => e.action === 'error').length,
      users: entries,
    };
    this.logger.log(
      {
        dryRun: report.dryRun,
        checked: report.checked,
        withBroadAccess: report.withBroadAccess,
        revoked: report.revoked,
        clearedInvalid: report.clearedInvalid,
        failed: report.failed,
      },
      'Auditoria de acessos Google concluída',
    );
    return report;
  }

  private async process(user: UserEntity, apply: boolean): Promise<GoogleAccessAuditEntry> {
    const base = { userId: user.id, email: user.email };
    const inspection = await this.inspect(user);

    if (inspection.kind === 'error') {
      return { ...base, action: 'error', excessScopes: [], error: inspection.message };
    }

    if (inspection.kind === 'invalid') {
      if (!apply) return { ...base, action: 'would_clear_invalid', excessScopes: [] };
      return this.disconnect(user, base, 'cleared_invalid', []);
    }

    const excess = inspection.scopes.filter((scope) => !ALLOWED_GOOGLE_SCOPES.has(scope));
    if (excess.length === 0) return { ...base, action: 'ok', excessScopes: [] };
    if (!apply) return { ...base, action: 'would_revoke', excessScopes: excess };
    return this.disconnect(user, base, 'revoked', excess);
  }

  private async disconnect(
    user: UserEntity,
    base: { userId: string; email: string },
    action: 'revoked' | 'cleared_invalid',
    excessScopes: string[],
  ): Promise<GoogleAccessAuditEntry> {
    try {
      await this.connectionService.disconnectUserConnection(user.id);
      return { ...base, action, excessScopes };
    } catch (error) {
      return {
        ...base,
        action: 'error',
        excessScopes,
        error: error instanceof Error ? error.message : 'falha ao desconectar',
      };
    }
  }

  /** Renova o token só para ler os escopos concedidos (não grava o access token novo). */
  private async inspect(user: UserEntity): Promise<Inspection> {
    let refreshToken: string;
    try {
      refreshToken = this.tokenCipher.decrypt(user.googleRefreshToken as string);
    } catch {
      return { kind: 'invalid' }; // ilegível (ex.: chave de cifra trocada): inútil, melhor limpar
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
          client_secret: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 400 || response.status === 401) {
        return { kind: 'invalid' }; // invalid_grant: já revogado ou expirado
      }
      if (!response.ok) {
        return { kind: 'error', message: `Google respondeu ${response.status}` };
      }
      const data = (await response.json()) as { scope?: string };
      const scopes = (data.scope ?? '').split(/\s+/).filter(Boolean);
      return { kind: 'scopes', scopes };
    } catch (error) {
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : 'falha de rede ao consultar o Google',
      };
    }
  }
}
