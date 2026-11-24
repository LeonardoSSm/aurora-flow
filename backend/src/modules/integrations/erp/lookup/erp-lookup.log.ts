const LOOKUP_PATH = /\/fields\/[^/?]+\/lookup(\?|$)/;

/**
 * Serializer `req` do pino-http: o log de requisição grava URL e query de tudo, e na pesquisa de
 * um campo "Lista do ERP" o texto digitado (`q`) pode ser nome de cliente, documento etc.
 * Troca só esse valor por `***`; o resto do registro fica igual.
 */
export function maskErpLookupSearch<T extends { url?: unknown; query?: unknown }>(req: T): T {
  if (typeof req.url !== 'string' || !LOOKUP_PATH.test(req.url)) {
    return req;
  }
  req.url = req.url.replace(/([?&]q=)[^&]*/g, '$1***');
  if (req.query && typeof req.query === 'object' && 'q' in req.query) {
    req.query = { ...(req.query as Record<string, unknown>), q: '***' };
  }
  return req;
}
