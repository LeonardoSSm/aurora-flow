import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './env.validation';

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // O docker-compose repassa variável não definida como string vazia (`${VAR:-}`). Vazio conta
  // como "não configurado", não como valor inválido.
  const preenchidas = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const validatedConfig = plainToInstance(EnvironmentVariables, preenchidas, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Configuração inválida de ambiente: ${messages}`);
  }

  return validatedConfig;
}
