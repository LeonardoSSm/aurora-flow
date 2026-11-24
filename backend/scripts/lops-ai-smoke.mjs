#!/usr/bin/env node
/**
 * Testa a API da LOPS IA (/api/v1/ai) do jeito que as tools "Tijuca Flow - ..." chamam, sem
 * precisar da LOPS: abre a sessão, consulta o catálogo, valida um processo e simula a criação.
 * Nada é gravado, a não ser com CRIAR=1.
 *
 * Uso (Node 18+):
 *   TIJUCA_URL=http://10.10.104.66:3000/api/v1 LOPS_AI_KEY=<chave> EMAIL=<seu e-mail> node scripts/lops-ai-smoke.mjs
 *
 *   TIJUCA_URL   base da API (padrão http://localhost:3000/api/v1)
 *   LOPS_AI_KEY  a mesma chave de LOPS_AI_INBOUND_API_KEY e da credencial "Tijuca Flow" na LOPS
 *   EMAIL        e-mail de um usuário ativo do Tijuca Flow com a permissão ai.copilot.use
 *   CRIAR=1      cria de verdade um rascunho "Teste LOPS IA <data>" e confere que repetir não duplica
 */

const BASE = (process.env.TIJUCA_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const KEY = process.env.LOPS_AI_KEY || '';
const EMAIL = process.env.EMAIL || '';
const CREATE = process.env.CRIAR === '1';

let failures = 0;
const ok = (step, detail = '') => console.log(`  OK    ${step}${detail ? ` — ${detail}` : ''}`);
const fail = (step, detail) => {
  failures += 1;
  console.log(`  FALHA ${step} — ${detail}`);
};

/** O que cada status costuma querer dizer aqui. */
function explain(status, body) {
  const message = typeof body === 'object' && body ? body.message ?? JSON.stringify(body) : String(body);
  const hints = {
    401: 'chave (X-API-Key) ou token errado/expirado',
    403: 'e-mail de outro domínio, usuário inativo, sem ai.copilot.use, ou IP fora de LOPS_AI_ALLOWED_IPS',
    404: 'rota não existe: o backend no ar não tem o módulo ai-builder (deploy antigo?)',
    422: 'processo com problemas',
    429: 'muitas chamadas seguidas (limite de requisições)',
    503: 'LOPS_AI_INBOUND_API_KEY não configurada no backend',
  };
  return `HTTP ${status}${hints[status] ? ` (${hints[status]})` : ''}: ${String(Array.isArray(message) ? message.join('; ') : message).slice(0, 300)}`;
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-API-Key': KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

/** Um processo pequeno escrito "do jeito do Gemini" (apelidos que o servidor converte). */
function sampleProcess(email) {
  return {
    name: `Teste LOPS IA ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    description: 'Criado pelo scripts/lops-ai-smoke.mjs. Pode apagar.',
    form: {
      type: 'stepper',
      sections: [
        {
          title: 'Dados',
          fields: [
            { code: 'nome', type: 'short_text', label: 'Nome', is_required: true },
            { code: 'genero', type: 'single_select', label: 'Gênero', config: { options: ['Masculino', 'Feminino'] } },
          ],
        },
        { title: 'Feedback', fields: [{ name: 'Pontuação', type: 'scale', config: { min: 1, max: 5 } }] },
      ],
    },
    phases: [
      { name: 'Novo', actors: [email] },
      { name: 'Pendente', actors: [email], approval: { approvers: [email], type: 'qualquer um' } },
      { name: 'Concluído', isTerminal: true },
    ],
  };
}

async function main() {
  console.log(`Tijuca Flow em ${BASE}\n`);
  if (!KEY || !EMAIL) {
    console.log('Informe LOPS_AI_KEY e EMAIL (veja o começo do arquivo).');
    process.exitCode = 2;
    return;
  }

  // 1. Abrir sessão (tool "Tijuca Flow - Abrir sessão")
  let session;
  try {
    session = await call('POST', '/ai/session', { body: { email: EMAIL } });
  } catch (error) {
    fail('Abrir sessão', `sem resposta de ${BASE} (${error.cause?.code ?? error.message}). Backend fora do ar, IP/porta errados ou rede diferente.`);
    process.exitCode = 1;
    return;
  }
  if (session.status !== 201 && session.status !== 200) {
    fail('Abrir sessão', explain(session.status, session.body));
    process.exitCode = 1;
    return;
  }
  const token = session.body.token;
  ok('Abrir sessão', `${session.body.user?.name ?? '?'} (${session.body.user?.email ?? EMAIL}), vale até ${session.body.expiresAt}`);

  // 2. Leituras (as tools de consulta)
  const reads = [
    ['Quem sou eu', '/ai/me', (b) => `perfil ${b.roleName ?? b.role}; criar processos: ${b.permissions?.['forms.create'] ? 'sim' : 'NÃO'}`],
    ['Obter manual', '/ai/guide', (b) => `${b.fieldTypes?.length ?? '?'} tipos de campo, ${b.flowNodes?.length ?? '?'} tipos de nó`],
    ['Obter formato do processo', '/ai/schema/process', () => 'schema ok'],
    ['Listar perfis', '/ai/catalog/roles', (b) => `${(Array.isArray(b) ? b : b.items ?? []).length} perfis`],
    ['Listar áreas', '/ai/catalog/areas', (b) => `${(Array.isArray(b) ? b : b.items ?? []).length} áreas`],
    ['Buscar pessoas', `/ai/catalog/users?search=${encodeURIComponent(EMAIL.split('@')[0])}`, (b) => `${(Array.isArray(b) ? b : b.items ?? []).length} encontrada(s)`],
    ['Listar listas de itens', '/ai/catalog/item-lists', (b) => `${(Array.isArray(b) ? b : b.items ?? []).length} listas`],
    ['Listar ERP', '/ai/catalog/erp', () => 'ok'],
    ['Listar integrações', '/ai/catalog/integrations', () => 'ok'],
    ['Listar processos', '/ai/processes', (b) => `${(Array.isArray(b) ? b : b.items ?? []).length} processos`],
  ];
  for (const [step, path, summary] of reads) {
    const result = await call('GET', path, { token });
    if (result.status === 200) ok(step, summary(result.body ?? {}));
    else fail(step, explain(result.status, result.body));
  }

  // 3. Validar (tool "Tijuca Flow - Validar processo")
  const bp = sampleProcess(EMAIL);
  const check = await call('POST', '/ai/processes/validate', { token, body: bp });
  if (check.status !== 200) {
    fail('Validar processo', explain(check.status, check.body));
  } else if (!check.body.valid) {
    fail('Validar processo', `inválido:\n${check.body.errors.map((e) => `          ${e.path}: ${e.message}`).join('\n')}`);
  } else {
    ok('Validar processo', `válido; ${check.body.adjusted?.length ?? 0} ajuste(s) de formato, ${check.body.warnings.length} aviso(s)`);
  }

  // 4. Criar em modo de teste (nada é gravado)
  const dry = await call('POST', '/ai/processes?dryRun=true', { token, body: bp });
  if (dry.status === 200 || dry.status === 201) ok('Criar processo (dryRun)', 'passaria; nada gravado');
  else fail('Criar processo (dryRun)', explain(dry.status, dry.body));

  // 5. Opcional: criar de verdade e repetir com a mesma chave
  if (CREATE) {
    const key = `smoke-${Date.now()}`;
    const first = await call('POST', '/ai/processes', { token, body: bp, headers: { 'Idempotency-Key': key } });
    if (first.status !== 201 && first.status !== 200) {
      fail('Criar processo', explain(first.status, first.body));
    } else {
      ok('Criar processo', `"${first.body.name}" em rascunho: ${first.body.builderUrl}`);
      const again = await call('POST', '/ai/processes', { token, body: bp, headers: { 'Idempotency-Key': key } });
      if (again.body?.replayed && again.body.processId === first.body.processId) ok('Repetir com a mesma chave', 'não duplicou');
      else fail('Repetir com a mesma chave', `esperava replayed com o mesmo processo; veio ${JSON.stringify(again.body).slice(0, 200)}`);
    }
  }

  console.log(failures ? `\n${failures} passo(s) falharam.` : '\nTudo certo: a LOPS IA deve conseguir usar todas as tools.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
