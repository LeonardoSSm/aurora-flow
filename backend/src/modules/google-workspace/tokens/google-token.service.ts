import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { UserEntity } from '../../../database/entities';
import { GoogleApiError, GoogleTokenExchangeResponse } from '../types/google-workspace.types';

@Injectable()
export class GoogleTokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenCipher: TokenCipherService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async getValidAccessToken(user: UserEntity): Promise<string> {
    if (user.googleAccessToken && user.googleTokenExpiresAt) {
      const expiresSoon = user.googleTokenExpiresAt.getTime() - Date.now() <= 60_000;
      if (!expiresSoon) {
        const plain = this.tryDecrypt(user.googleAccessToken);
        if (plain) return plain;
      }
    }

    if (!user.googleRefreshToken) {
      throw new GoogleApiError('Conta Google desconectada ou sem refresh token disponivel.', true);
    }

    const plainRefresh = this.tryDecrypt(user.googleRefreshToken);
    if (!plainRefresh) {
      throw new GoogleApiError('Conta Google precisa ser reconectada.', false);
    }

    return this.refreshAccessToken(user, plainRefresh);
  }

  tryDecrypt(value: string): string | null {
    try {
      return this.tokenCipher.decrypt(value);
    } catch {
      return null;
    }
  }

  private async refreshAccessToken(user: UserEntity, plainRefresh: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      refresh_token: plainRefresh,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new GoogleApiError(
        `Nao foi possivel renovar o token do Google Workspace: ${text || response.statusText}`,
        response.status >= 500 || response.status === 429 || response.status === 408,
        response.status,
      );
    }

    const data = (await response.json()) as GoogleTokenExchangeResponse;
    if (!data.access_token) {
      throw new GoogleApiError('Google nao retornou access token ao renovar a sessao.', true);
    }

    user.googleAccessToken = this.tokenCipher.encrypt(data.access_token);
    user.googleTokenExpiresAt =
      typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null;
    user.googleDisconnectedAt = null;
    await this.usersRepository.save(user);

    return data.access_token;
  }
}
