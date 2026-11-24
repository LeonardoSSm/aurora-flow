import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GoogleStateHelper } from './google-state.helper';
import type { GoogleStatePayload } from '../types/google-workspace.types';

function makeHelper(secret = 'test-secret-key'): GoogleStateHelper {
  const configService = { getOrThrow: () => secret } as unknown as ConfigService;
  return new GoogleStateHelper(configService);
}

describe('GoogleStateHelper', () => {
  const helper = makeHelper();

  const basePayload = (): GoogleStatePayload => ({
    action: 'login',
    exp: Date.now() + 10 * 60 * 1000,
  });

  describe('encodeState / decodeState round-trip', () => {
    it('recovers a login payload', () => {
      const payload = basePayload();
      const token = helper.encodeState(payload);
      const decoded = helper.decodeState(token);
      expect(decoded.action).toBe('login');
      expect(decoded.exp).toBe(payload.exp);
    });

    it('recovers a connect payload with userId and redirectPath', () => {
      const payload: GoogleStatePayload = {
        action: 'connect',
        userId: 'user-abc',
        redirectPath: '/builder',
        exp: Date.now() + 5 * 60 * 1000,
      };
      const decoded = helper.decodeState(helper.encodeState(payload));
      expect(decoded.action).toBe('connect');
      expect(decoded.userId).toBe('user-abc');
      expect(decoded.redirectPath).toBe('/builder');
    });

    it('produces a different token on each call (random-ish base64 of same object is stable, but exp differs)', () => {
      const p1 = basePayload();
      const p2 = { ...p1, exp: p1.exp + 1 };
      expect(helper.encodeState(p1)).not.toBe(helper.encodeState(p2));
    });
  });

  describe('signature validation', () => {
    it('rejects a token with a tampered body', () => {
      const token = helper.encodeState(basePayload());
      const [, sig] = token.split('.');
      const tamperedBody = Buffer.from('{"action":"login","exp":9999999999999}').toString(
        'base64url',
      );
      expect(() => helper.decodeState(`${tamperedBody}.${sig}`)).toThrow(UnauthorizedException);
    });

    it('rejects a token with a tampered signature', () => {
      const token = helper.encodeState(basePayload());
      const [body] = token.split('.');
      expect(() => helper.decodeState(`${body}.invalidsignature`)).toThrow(UnauthorizedException);
    });

    it('rejects a token signed with a different secret', () => {
      const otherHelper = makeHelper('different-secret');
      const token = otherHelper.encodeState(basePayload());
      expect(() => helper.decodeState(token)).toThrow(UnauthorizedException);
    });

    it('rejects a token with no dot separator', () => {
      expect(() => helper.decodeState('nodothere')).toThrow(UnauthorizedException);
    });
  });

  describe('expiry validation', () => {
    it('rejects an expired payload', () => {
      const expired: GoogleStatePayload = { action: 'login', exp: Date.now() - 1 };
      const token = helper.encodeState(expired);
      expect(() => helper.decodeState(token)).toThrow(UnauthorizedException);
    });

    it('rejects a payload with exp === 0', () => {
      const payload: GoogleStatePayload = { action: 'login', exp: 0 };
      const token = helper.encodeState(payload);
      expect(() => helper.decodeState(token)).toThrow(UnauthorizedException);
    });
  });
});
