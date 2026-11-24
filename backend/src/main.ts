import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { static as serveStatic } from 'express';
import helmet from 'helmet';
import { basename, join } from 'path';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { downloadContentDisposition } from './modules/forms/form-download';
import { seedSettings } from './database/seed/settings.seed';
import { UsersService } from './modules/users/users.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const apiPrefix = configService.getOrThrow<string>('API_PREFIX');

  // O padrão do Express é 100 kb; uma "Tabela dinâmica do ERP" com 500 linhas preenchidas passa
  // disso (Docs/campo_tabela_dinamica_erp_implantacao.md §7.6).
  app.useBodyParser('json', { limit: '2mb' });
  // Rota de lista do webhook (POST /webhooks/in/:token/list): outro sistema manda os números de
  // pedido como texto puro ou CSV no corpo.
  app.useBodyParser('text', { type: ['text/plain', 'text/csv'], limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());

  const corsOriginRaw = configService.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const allowedOrigins = corsOriginRaw.split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(
    `/${apiPrefix}/v1/public/uploads`,
    // Anexos de formulario publico nunca devem renderizar inline no navegador
    // (mesmo com o tipo real ja validado por magic bytes no upload) — forcar
    // download fecha a segunda camada de uma cadeia de XSS armazenado.
    serveStatic(join(process.cwd(), 'uploads', 'public-forms'), {
      setHeaders: (res) => {
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
  app.use(
    `/${apiPrefix}/v1/public/form-downloads`,
    // Campo "Arquivo para baixar": arquivo posto no formulário por quem edita o processo (ex.: termo
    // para assinar). Sempre como download, com o nome legível que o servidor gravou (a pasta com
    // uuid fica de fora), nosniff e uma CSP que não deixa nada rodar se o arquivo for aberto direto.
    serveStatic(join(process.cwd(), 'uploads', 'form-downloads'), {
      index: false,
      dotfiles: 'deny',
      setHeaders: (res, filePath) => {
        res.setHeader('Content-Disposition', downloadContentDisposition(basename(filePath)));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Aurora Flow API')
      .setDescription('API do Aurora Flow — motor de automações de propósito geral')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/v1/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(
      `Swagger UI disponivel em http://localhost:${configService.get('PORT')}/${apiPrefix}/v1/docs`,
    );
  }

  const usersService = app.get(UsersService);
  await usersService.ensureSeedAdmin();

  const dataSource = app.get(DataSource);
  await seedSettings(dataSource);

  const port = Number(configService.getOrThrow<string>('PORT'));
  await app.listen(port);
  logger.log(`API iniciada em http://localhost:${port}/${apiPrefix}/v1`);
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'error',
      message: 'Falha ao iniciar aplicacao',
      error: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exit(1);
});
