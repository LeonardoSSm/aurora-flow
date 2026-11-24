import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { GoogleStatePayload } from '../types/google-workspace.types';

@Injectable()
export class GoogleStateHelper {
  constructor(private readonly configService: ConfigService) {}

  encodeState(payload: GoogleStatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  decodeState(value: string): GoogleStatePayload {
    const dotIndex = value.indexOf('.');
    if (dotIndex === -1) {
      throw new UnauthorizedException('Estado OAuth invalido.');
    }

    const body = value.slice(0, dotIndex);
    const signature = value.slice(dotIndex + 1);

    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new UnauthorizedException('Estado OAuth invalido.');
    }

    let payload: GoogleStatePayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GoogleStatePayload;
    } catch {
      throw new UnauthorizedException('Estado OAuth invalido.');
    }

    if (!payload.exp || payload.exp < Date.now()) {
      throw new UnauthorizedException('Autorizacao Google expirada.');
    }

    return payload;
  }

  private secret(): string {
    return this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
}
