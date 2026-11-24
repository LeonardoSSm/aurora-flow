import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TurnstileVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

@Injectable()
export class PublicCaptchaService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.configService.get<string>('TURNSTILE_SECRET_KEY')?.trim());
  }

  async verifyToken(token?: string, remoteIp?: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    if (!token?.trim()) {
      throw new BadRequestException('Confirme o CAPTCHA antes de enviar o formulário.');
    }

    const body = new URLSearchParams({
      secret: this.configService.getOrThrow<string>('TURNSTILE_SECRET_KEY'),
      response: token.trim(),
    });

    if (remoteIp?.trim()) {
      body.set('remoteip', remoteIp.trim());
    }

    let payload: TurnstileVerifyResponse;
    try {
      const response = await fetch(
        this.configService.get<string>(
          'TURNSTILE_VERIFY_URL',
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException('Não foi possível validar o CAPTCHA agora.');
      }

      payload = (await response.json()) as TurnstileVerifyResponse;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Não foi possível validar o CAPTCHA agora.');
    }

    if (!payload.success) {
      throw new BadRequestException('Falha na validação do CAPTCHA. Tente novamente.');
    }
  }
}
