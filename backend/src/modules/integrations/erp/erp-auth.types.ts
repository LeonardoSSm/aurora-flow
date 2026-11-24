export type ErpAuthType = 'bearer_static' | 'oauth2_client' | 'basic_login';

export type ErpRefreshCredentials = {
  // OAuth2 Client Credentials
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;  // relative ('/oauth2/token') or absolute URL
  scope?: string;

  // Basic Login
  username?: string;
  password?: string;
  loginUrl?: string;          // relative ('/api/login') or absolute URL
  tokenJsonPath?: string;     // dot notation: 'access_token' or 'data.token'
};
