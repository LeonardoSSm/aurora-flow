import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { TokenGuard } from './token.guard';

const TOKEN = 'a'.repeat(64);

function contexto(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

function guard(token?: string): TokenGuard {
  return new TokenGuard({ token } as AppConfig);
}

describe('TokenGuard', () => {
  it('deixa passar com o token certo', () => {
    expect(guard(TOKEN).canActivate(contexto(`Bearer ${TOKEN}`))).toBe(true);
  });

  it('recusa token errado, de outro tamanho, sem "Bearer" ou ausente', () => {
    const g = guard(TOKEN);
    expect(() => g.canActivate(contexto(`Bearer ${'b'.repeat(64)}`))).toThrow(
      UnauthorizedException,
    );
    expect(() => g.canActivate(contexto('Bearer curto'))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(contexto(TOKEN))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(contexto())).toThrow(UnauthorizedException);
  });

  it('sem token configurado, recusa tudo', () => {
    expect(() => guard(undefined).canActivate(contexto('Bearer '))).toThrow(UnauthorizedException);
    expect(() => guard(undefined).canActivate(contexto(`Bearer ${TOKEN}`))).toThrow(
      UnauthorizedException,
    );
  });
});
