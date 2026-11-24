import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class TokenCipherService {
  private readonly key: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    const keyB64 = configService.get<string>('GOOGLE_TOKEN_ENCRYPTION_KEY');
    if (!keyB64) {
      this.key = null;
      return;
    }
    const keyBuf = Buffer.from(keyB64, 'base64');
    if (keyBuf.length < 32) {
      throw new Error(
        `GOOGLE_TOKEN_ENCRYPTION_KEY deve decodificar para pelo menos 32 bytes (atual: ${keyBuf.length}).`,
      );
    }
    this.key = keyBuf.subarray(0, 32);
  }

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const key = this.getKey();
    if (!payload.startsWith('v1.')) {
      throw new Error(`Versão de token cifrado não suportada.`);
    }
    const parts = payload.split('.');
    if (parts.length !== 4) {
      throw new Error('Formato de token cifrado inválido.');
    }
    const [, ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  }

  private getKey(): Buffer {
    if (!this.key) {
      throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não está configurada.');
    }
    return this.key;
  }
}
