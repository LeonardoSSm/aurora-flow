import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptRecord = { count: number; expiresAt: number };

@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);
  private readonly store = new Map<string, AttemptRecord>();

  isBlocked(email: string): boolean {
    const rec = this.store.get(email);
    if (!rec) return false;
    if (Date.now() > rec.expiresAt) {
      this.store.delete(email);
      return false;
    }
    return rec.count >= MAX_ATTEMPTS;
  }

  record(email: string): void {
    const now = Date.now();
    const existing = this.store.get(email);
    if (existing && now <= existing.expiresAt) {
      existing.count++;
    } else {
      this.store.set(email, { count: 1, expiresAt: now + WINDOW_MS });
    }
  }

  reset(email: string): void {
    this.store.delete(email);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  sweepExpired(): void {
    const now = Date.now();
    let swept = 0;
    for (const [email, rec] of this.store) {
      if (now > rec.expiresAt) {
        this.store.delete(email);
        swept++;
      }
    }
    if (swept > 0) {
      this.logger.debug(`Swept ${swept} expired login-attempt record(s)`);
    }
  }
}
