process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.API_PREFIX = 'api';

process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USER = process.env.DB_USER ?? 'formhub';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'formhub';
process.env.DB_NAME = process.env.DB_NAME ?? 'formhub_test';
process.env.DB_SYNC = 'true';
// Migrations carregam dado semente que o synchronize nunca gera sozinho — os 4 perfis
// (admin/editor/viewer/manager) em RolesAndPermissions, por exemplo, e users.role tem FK
// pra roles.code. Sem migrationsRun, um banco realmente limpo (like o do CI) cria o schema
// certinho mas deixa "roles" vazia, e o primeiro INSERT em "users" (o admin semente) falha
// com violação de FK. `??` porque continua dando pra sobrescrever na mão se precisar.
process.env.DB_AUTO_MIGRATE = process.env.DB_AUTO_MIGRATE ?? 'true';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'formhub-access-secret-test';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '2h';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'formhub-refresh-secret-test';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
