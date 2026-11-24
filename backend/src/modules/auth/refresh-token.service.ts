import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { RefreshTokenEntity } from '../../database/entities';
import { JwtPayload } from './types/jwt-payload.type';

/** Janela em que reapresentar um refresh token recém-girado não é tratado como roubo. */
export const REFRESH_REUSE_GRACE_MS = 30_000;

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repo: Repository<RefreshTokenEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issue(payload: JwtPayload, ip: string | null, userAgent: string | null): Promise<string> {
    return this._issue(payload, ip, userAgent, this.repo.manager);
  }

  async rotate(oldRawToken: string, ip: string | null, userAgent: string | null): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      const oldHash = this.hash(oldRawToken);
      const oldRecord = await manager.findOne(RefreshTokenEntity, {
        where: { tokenHash: oldHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!oldRecord) {
        throw new UnauthorizedException('Refresh token não reconhecido.');
      }

      if (oldRecord.revokedAt !== null) {
        // Duas renovações quase juntas com o mesmo cookie (duas abas abrindo, reload no
        // meio de uma renovação) não são roubo: a segunda chega logo depois da primeira
        // ter girado o token. Dentro da janela de tolerância, e só se o token foi trocado
        // por rotação (não por logout/troca de senha), emite outro token da mesma sessão.
        if (await this.isWithinReuseGrace(oldRecord, manager)) {
          return this._issue(this.payloadOf(oldRawToken), ip, userAgent, manager);
        }
        await this.revokeAllForUser(oldRecord.userId);
        throw new UnauthorizedException(
          'Refresh token já utilizado. Todas as sessões foram encerradas por segurança.',
        );
      }

      const newToken = await this._issue(this.payloadOf(oldRawToken), ip, userAgent, manager);

      const newRecord = await manager.findOne(RefreshTokenEntity, {
        where: { tokenHash: this.hash(newToken) },
      });
      oldRecord.revokedAt = new Date();
      oldRecord.replacedByTokenId = newRecord?.id ?? null;
      await manager.save(oldRecord);

      return newToken;
    });
  }

  async revoke(tokenId: string): Promise<void> {
    await this.repo.update({ id: tokenId }, { revokedAt: new Date() });
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    const tokenHash = this.hash(rawToken);
    const record = await this.repo.findOne({ where: { tokenHash, revokedAt: IsNull() } });
    if (record) {
      await this.revoke(record.id);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async _issue(
    payload: JwtPayload,
    ip: string | null,
    userAgent: string | null,
    manager: EntityManager,
  ): Promise<string> {
    const tokenPayload = { ...payload, jti: randomUUID() };
    const token = await this.jwtService.signAsync(tokenPayload);
    const tokenHash = this.hash(token);
    const expiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');

    const entity = manager.create(RefreshTokenEntity, {
      userId: payload.sub,
      tokenHash,
      expiresAt: this.parseExpiry(expiresIn),
      ipAddress: ip,
      userAgent,
      revokedAt: null,
      replacedByTokenId: null,
    });

    try {
      await manager.save(entity);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new UnauthorizedException('Sessão expirada, faça login novamente.');
      }
      throw err;
    }

    return token;
  }

  /**
   * O token já girado ainda vale por alguns segundos se foi substituído por rotação e
   * o substituto não foi encerrado (logout). Logout e "encerrar todas" deixam
   * `replacedByTokenId` nulo, então nunca entram aqui.
   */
  private async isWithinReuseGrace(
    record: RefreshTokenEntity,
    manager: EntityManager,
  ): Promise<boolean> {
    if (!record.revokedAt || !record.replacedByTokenId) return false;
    if (Date.now() - record.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) return false;
    const replacement = await manager.findOne(RefreshTokenEntity, {
      where: { id: record.replacedByTokenId },
    });
    if (!replacement) return false;
    // Substituto ativo, ou girado de novo (outra aba): a sessão segue viva.
    return replacement.revokedAt === null || replacement.replacedByTokenId !== null;
  }

  private payloadOf(rawToken: string): JwtPayload {
    const {
      exp: _exp,
      iat: _iat,
      jti: _jti,
      ...cleanPayload
    } = this.jwtService.decode(rawToken) as JwtPayload & {
      exp?: number;
      iat?: number;
      jti?: string;
    };
    return cleanPayload;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(expiresIn: string): Date {
    const match = /^(\d+)(s|m|h|d)$/.exec(expiresIn);
    if (!match) throw new Error(`JWT_REFRESH_EXPIRES_IN inválido: ${expiresIn}`);
    const value = parseInt(match[1], 10);
    const ms: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + value * ms[match[2]]);
  }
}
