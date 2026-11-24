import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { configurarApp } from './configurar-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  // Fecha o pool do MySQL no `docker stop`.
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  // Sem host: escuta em IPv4 e IPv6. No Alpine, "localhost" do healthcheck resolve para ::1.
  await app.listen(config.porta);
  new Logger('Bootstrap').log(
    `erp-lookup ouvindo na porta ${config.porta} · banco ${config.db ? 'configurado' : 'NÃO configurado'} · token ${config.token ? 'configurado' : 'NÃO configurado'}`,
  );
}

void bootstrap();
