import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class HmacService {
  sign(secret: string, payload: string): string {
    return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  verify(secret: string, payload: string, signature: string): boolean {
    const normalized = this.normalizeSignature(signature);
    if (!normalized) return false;

    const expected = Buffer.from(this.sign(secret, payload), 'hex');
    const received = Buffer.from(normalized, 'hex');
    if (expected.length !== received.length) return false;

    return crypto.timingSafeEqual(expected, received);
  }

  private normalizeSignature(signature: string): string | null {
    const normalized = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (!/^[a-f0-9]{64}$/i.test(normalized)) return null;
    return normalized;
  }
}
