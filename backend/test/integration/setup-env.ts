process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.API_PREFIX = 'api';

process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USER = process.env.DB_USER ?? 'aurora_flow';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'aurora_flow';
process.env.DB_NAME = process.env.DB_NAME ?? 'aurora_flow_test';
process.env.DB_SYNC = 'true';
process.env.DB_AUTO_MIGRATE = process.env.DB_AUTO_MIGRATE ?? 'true';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'aurora-flow-access-secret-test-32b';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '2h';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'aurora-flow-refresh-secret-test-32';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
process.env.HTTP_ALLOW_PRIVATE_URLS = process.env.HTTP_ALLOW_PRIVATE_URLS ?? 'true';
process.env.SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'AuroraFlow@123';
