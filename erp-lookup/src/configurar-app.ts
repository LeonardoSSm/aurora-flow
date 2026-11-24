import { type INestApplication, ValidationPipe } from '@nestjs/common';

/** Compartilhado entre o main.ts e os testes HTTP, para os dois validarem igual. */
export function configurarApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
