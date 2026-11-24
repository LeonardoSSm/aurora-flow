import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MysqlService } from '../db/mysql.service';
import type { Fonte } from './fonte.types';
import { criarFontes } from './fontes.config';

@Injectable()
export class FontesRegistry {
  private readonly fontes = new Map<string, Fonte>();

  constructor(db: MysqlService, @Inject(APP_CONFIG) config: AppConfig) {
    for (const fonte of criarFontes(db, config)) {
      if (this.fontes.has(fonte.id)) {
        throw new Error(`Lista duplicada: "${fonte.id}".`);
      }
      this.fontes.set(fonte.id, fonte);
    }
  }

  listar(): Fonte[] {
    return [...this.fontes.values()];
  }

  obter(id: string): Fonte | undefined {
    return this.fontes.get(id);
  }
}
