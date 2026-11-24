import { BarChart3, ClipboardList, Columns3, FileText, Inbox, Wand2 } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

export const FORMULARIOS_ARTICLES: DocArticle[] = [
  {
    slug: 'formularios',
    title: 'Formulários',
    group: 'formularios',
    icon: FileText,
    summary:
      'Criação, versionamento e publicação de formulários — a base sobre a qual respostas, Kanban e fluxos são construídos.',
    tags: ['form', 'builder', 'versão', 'publicar', 'rascunho', 'campo', 'seção'],
    sourcePaths: {
      backend: 'backend/src/modules/forms',
      frontend: 'frontend/src/modules/forms, frontend/src/modules/builder',
    },
    uiRoutes: ['/formularios', '/builder', '/f/:formId'],
    primary: [
      {
        id: 'estrutura',
        title: 'Estrutura de um formulário',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Um formulário é uma casca estável (nome, área, responsáveis, configurações de integração) que aponta para **versões**. A versão é que carrega o conteúdo: seções, campos, opções e ramificações condicionais.',
          },
          {
            kind: 'paragraph',
            text: 'Essa separação existe por um motivo prático: toda resposta guarda o `form_version_id` respondido. Editar o formulário depois nunca reinterpreta respostas antigas — uma exportação de seis meses atrás continua batendo com o que o respondente viu na época.',
          },
          {
            kind: 'table',
            columns: ['Nível', 'Tabela', 'O que guarda'],
            rows: [
              ['Formulário', '`forms`', 'Identidade, área, Google Sheets, status'],
              ['Vínculos', '`form_members` + `form_member_permissions`', 'Quem tem acesso ao processo e o que pode fazer nele'],
              ['Versão', '`form_versions`', 'Título exibido, publicação e configurações da versão'],
              ['Seção', '`form_sections`', 'Agrupamento e ordem; base da navegação por etapas'],
              ['Ramificação', '`form_section_branches`', 'Para qual seção ir conforme a resposta'],
              ['Campo', '`form_fields`', 'Código, rótulo, tipo, obrigatoriedade, ordem'],
              ['Opção', '`form_field_options`', 'Alternativas de campos de seleção'],
            ],
          },
        ],
      },
      {
        id: 'ciclo',
        title: 'Estados e ciclo de vida',
        blocks: [
          {
            kind: 'table',
            columns: ['Status', 'Efeito'],
            rows: [
              ['`draft`', 'Só visível internamente; não aceita respostas públicas'],
              ['`published`', 'Aceita respostas em `/f/:formId`'],
              ['`paused`', 'Publicado, mas temporariamente sem aceitar respostas'],
              ['`expired`', 'Encerrado por prazo'],
              ['`archived`', 'Fora de uso; preserva histórico e respostas'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Rascunho também serve como formulário técnico',
            text: 'Integrações que precisam de um "rótulo" para escopar fluxos (ex.: isolar o gatilho de retorno de um ERP) usam um formulário em rascunho, nunca publicado, apenas para amarrar solicitações e fluxos ao mesmo `form_id`.',
          },
          {
            kind: 'list',
            items: [
              'Excluir é sempre lógico (`softDelete`) — respostas e histórico permanecem.',
              'Duplicar copia a estrutura da versão atual e nasce como rascunho.',
              'Quem tem acesso ao processo está nos vínculos (`form_members`), cada um com as permissões daquela pessoa naquele processo. Quem cria vira dono completo; as pessoas escolhidas ao criar entram com o modelo Operador; depois, o acesso muda em Criador › Pessoas com acesso ou em Usuários › Processos. A antiga atribuição (`form_assignees`) foi convertida em vínculo e removida.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'endpoints-forms',
        title: 'Endpoints',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/forms', description: 'Lista paginada, já filtrada pelo escopo do perfil.', permission: 'forms.view' },
              { method: 'GET', path: '/forms/:id', description: 'Formulário com a estrutura da versão atual.', permission: 'forms.view' },
              { method: 'POST', path: '/forms', description: 'Cria formulário e a primeira versão.', permission: 'forms.create' },
              { method: 'PATCH', path: '/forms/:id', description: 'Atualiza metadados e estrutura, gerando nova versão quando necessário.', permission: 'forms.edit' },
              { method: 'PATCH', path: '/forms/:id/status', description: 'Publica, pausa ou arquiva.', permission: 'forms.publish' },
              { method: 'POST', path: '/forms/:id/duplicate', description: 'Duplica o formulário como rascunho.', permission: 'forms.create' },
              { method: 'DELETE', path: '/forms/:id', description: 'Exclusão lógica.', permission: 'forms.publish' },
              { method: 'GET', path: '/public/forms/:id', description: 'Estrutura pública da versão publicada.', public: true, rateLimit: '30/min' },
              { method: 'POST', path: '/public/forms/:id/uploads', description: 'Upload de arquivo em formulário público.', public: true, rateLimit: '5/min' },
              { method: 'GET', path: '/public/forms/:id/fields/:fieldCode/lookup', description: 'Pesquisa as opções de um campo "Lista do ERP" (`?q=`). Com `exigirLogin` no campo, só responde a quem manda token.', public: true, rateLimit: '60/min' },
              { method: 'GET', path: '/solicitations/:id/erp-details', description: 'Ficha do ERP de cada campo "Lista do ERP" respondido na solicitação (aprovação e card da fase). `status`: ok, sem_detalhes ou indisponivel.', permission: 'solicitations.view' },
              { method: 'GET', path: '/erp/lookup/connectors', description: 'Conectores de ERP ativos (id e nome) para configurar um campo "Lista do ERP".', permission: 'forms.edit' },
              { method: 'GET', path: '/erp/lookup/connectors/:id/fontes', description: 'Listas disponíveis na API erp-lookup do conector.', permission: 'forms.edit' },
              { method: 'GET', path: '/forms/:id/google-sheets', description: 'Situação da planilha vinculada.', permission: 'forms.view' },
              { method: 'POST', path: '/forms/:id/google-sheets/create', description: 'Cria a planilha vinculada ao formulário.', permission: 'forms.edit' },
              { method: 'POST', path: '/forms/:id/google-sheets/reenqueue', description: 'Reenfileira jobs de sincronização travados.', permission: 'forms.edit' },
              { method: 'POST', path: '/forms/:id/google-sheets/reprocess', description: 'Recria jobs para respostas já existentes.', permission: 'forms.edit' },
            ],
          },
          { kind: 'events', emits: ['forms.created', 'forms.updated', 'forms.status_changed', 'forms.published', 'forms.archived', 'forms.duplicated'] },
        ],
      },
      {
        id: 'tipos-campo',
        title: 'Tipos de campo',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Definidos em `FormFieldType`. Além dos campos de dado, há quatro tipos de apresentação (`title`, `description`, `divider`, `file_download`) que não produzem resposta.',
          },
          {
            kind: 'code',
            code: `short_text   long_text   number     date      time      datetime
email        phone       cpf        cnpj      cep       currency
calculated   single_select  multi_select  checkbox  file_upload
scale        rating       product_table  erp_lookup  erp_table  item_order
title        description  divider   file_download`,
            caption: 'backend/src/common/enums/form-field-type.enum.ts',
          },
          {
            kind: 'paragraph',
            text: 'O `calculated` não é preenchido pelo respondente: o valor sai de uma fórmula guardada em `settingsJson.formula`, que referencia outros campos pelo código — `{quantidade} * {preco}` — e pode usar o resultado de outro campo calculado. O navegador mostra o número enquanto o formulário é preenchido, mas quem grava é o backend, que recalcula tudo e ignora o valor enviado pelo cliente.',
          },
          {
            kind: 'paragraph',
            text: 'O `product_table` guarda uma lista fixa de produtos (as opções do campo, definidas por quem cria o formulário) e colunas configuráveis em `settingsJson.productTableColumns` (`{ id, label, type, filledBy }`) — cada coluna é preenchida pelo criador (`filledBy: creator`, com o valor fixo em `settingsJson.productTableProductValues`) ou por quem responde (`filledBy: respondent`). Uma fórmula em `calculated` referencia as colunas dessa tabela com `SOMAPRODUTO`/`SOMAQUOCIENTE` — ex.: `SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")` soma, linha a linha, o produto das colunas indicadas; `SOMAQUOCIENTE` faz o mesmo para a divisão entre duas colunas, já que essa (ao contrário de soma/subtração) não é distributiva.',
          },
          {
            kind: 'paragraph',
            text: 'O `item_order` ("Pedido de itens") liga o campo a uma lista de itens (`settingsJson.itemListId`): em vez de mostrar a lista inteira, quem responde pesquisa pelo nome ou código, adiciona os itens e preenche as colunas do formulário em cada um (`inputColumns`, as mesmas regras da tabela do ERP — ex.: Quantidade obrigatória com mínimo 1). `itemColumns` escolhe quais colunas da lista aparecem (além do nome) e `totalPriceColumn` × `totalQuantityColumn` liga subtotal e total. O formulário público recebe os itens ativos já com as colunas escolhidas, sem o id da lista. No envio vão só a chave de cada item e o preenchido; o backend confere os itens na lista atual (inativo ou repetido é recusado) e grava um retrato no mesmo formato do da tabela do ERP, com subtotal e total. Só pelo portal web: o app mostra o aviso. Também existe em campo de fase: salvar as fases confere a lista como na publicação, e salvar os campos do card monta o retrato do mesmo jeito (`{ rows: [] }` limpa; o que não for objeto — app móvel — é ignorado, para não apagar o pedido).',
          },
          {
            kind: 'paragraph',
            text: 'O "E-mail de usuário" não é um tipo novo: é o `email` com `settingsJson.userSuggestions = { userIds, onlySuggested }` (no seletor aparece logo após o E-mail, como a "Lista suspensa"). O valor gravado continua sendo só o e-mail, então notificações, exportações e `{{campo}}` tratam igual. `userIds` vazio sugere qualquer usuário ativo; com pessoas escolhidas, só elas. O formulário publicado nunca recebe os ids: `/public/forms/:id` troca por `users: [{ name, email }]` das pessoas ativas, e sem pessoas escolhidas o navegador pesquisa em `GET /public/forms/:id/fields/:code/user-suggestions?q=` (mínimo 3 letras, até 8 pessoas, 40 pesquisas/min). Com `onlySuggested`, o envio (`/responses/submit`) e o salvamento dos campos de fase recusam e-mail que não seja de usuário ativo (ou de uma das pessoas escolhidas) — 422 no campo / 400 com o rótulo. Vale no formulário de abertura e em campo de fase; o app móvel mostra um campo de e-mail comum (o backend confere a trava). O e-mail desse campo não vira contato do solicitante, salvo rótulo "seu e-mail".',
          },
          {
            kind: 'paragraph',
            text: 'O `file_download` ("Arquivo para baixar") entrega um arquivo a quem responde — ex.: um termo para baixar, assinar e anexar num `file_upload` logo abaixo. Quem edita o processo envia o arquivo no construtor (`POST /forms/:id/download-files`, `forms.edit`, até 10 MB; PDF/PNG/JPG conferidos pelos bytes, Word/Excel/ODF pelo contêiner ZIP/OLE + extensão; nunca SVG/HTML). Ele fica em `uploads/form-downloads/<formId>/<uuid>/<nome>.<ext>` (volume `formhub_uploads`) e é servido em `/public/form-downloads/...` sempre como download (`Content-Disposition: attachment`, nosniff, CSP sandbox). `settingsJson.downloadFile` guarda só `{ path, name, size }`; ao salvar, caminho fora do padrão gerado pelo servidor é recusado (400). Rascunho pode ficar sem arquivo; publicar exige o arquivo, e que ele ainda exista no disco. Só no formulário de abertura (não existe em campo de fase nem em pergunta padrão); o app abre o arquivo no navegador do aparelho.',
          },
          {
            kind: 'paragraph',
            text: 'O `erp_lookup` ("Lista do ERP") mostra opções vindas do banco do ERP pela API interna `erp-lookup`: `settingsJson` guarda o conector (`erpConnectorId`), a lista (`fonte`), o modo (`lista` carrega tudo; `pesquisa` busca enquanto digita, a partir de `minCaracteres`) e `exigirLogin`. O formulário público não recebe conector nem lista. No envio vai só o código; o backend confere no ERP e grava `value_text` = nome devolvido pelo ERP e `value_json` = `{ value, label, fonte, resolvidoEm }`. ERP fora → 503 `ERP_INDISPONIVEL` e nada é gravado. Nos fluxos, `{{campo}}` é o nome e `{{campo_codigo}}` o código. Depois do envio, a ficha do item aparece como "Dados do ERP" na decisão da aprovação e no card da fase (`GET /solicitations/:id/erp-details`, que usa o campo da versão respondida e consulta o ERP na hora). Não existe em campo de fase nem em pergunta padrão. Detalhes em `Docs/campo_lista_erp_plano.md`.',
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/forms/forms.service.ts', note: 'CRUD, publicação, duplicação' },
              { path: 'backend/src/modules/forms/form-version.writer.ts', note: 'escrita da estrutura versionada' },
              { path: 'backend/src/modules/forms/public-forms.service.ts', note: 'projeção pública da versão' },
              { path: 'backend/src/common/formula/formula.engine.ts', note: 'motor de fórmulas (recálculo no envio), incluindo SOMAPRODUTO/SOMAQUOCIENTE' },
              { path: 'frontend/src/modules/public-form/components/public-question-field.tsx', note: 'renderização da tabela de produtos no formulário público' },
              { path: 'frontend/src/modules/builder/', note: 'editor de formulários' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'respostas',
    title: 'Respostas',
    group: 'formularios',
    icon: Inbox,
    summary:
      'Envio, validação, progresso parcial e exportação em CSV, XLSX e PDF.',
    tags: ['submission', 'resposta', 'exportar', 'csv', 'xlsx', 'pdf', 'captcha', 'idempotência'],
    sourcePaths: {
      backend: 'backend/src/modules/responses',
      frontend: 'frontend/src/modules/responses, frontend/src/modules/public-form',
    },
    uiRoutes: ['/registros/:formId'],
    primary: [
      {
        id: 'envio',
        title: 'O caminho de um envio',
        blocks: [
          { kind: 'diagram', id: 'resposta-formulario' },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Idempotência primeiro',
                text: 'Se o payload traz uma chave de idempotência já usada naquele formulário, a resposta existente é devolvida e nada novo é criado. É o que protege contra duplo clique e reenvio de rede.',
              },
              {
                title: 'Formulário e versão precisam estar publicados',
                text: 'A versão é carregada com seções, campos, opções e ramificações. Formulário não publicado devolve 404 — inclusive para quem tem o link.',
              },
              {
                title: 'Captcha',
                text: 'Verificação Turnstile, aplicada apenas quando `TURNSTILE_SECRET_KEY` está configurada. Sem a chave, a etapa é um no-op.',
              },
              {
                title: 'Validação estrutural e de conteúdo',
                text: 'Primeiro um portão estrutural (campo existe naquela versão? tipo bate?), depois o `FormSubmissionValidator`, que normaliza valores e avalia campos condicionais.',
              },
              {
                title: 'Gravação atômica',
                text: 'Resposta, itens e o job de sincronização com o Google Sheets são gravados na mesma transação — se o job falhar, a resposta inteira é revertida.',
              },
              {
                title: 'Evento',
                text: '`responses.submitted` dispara, em paralelo, auditoria, criação de solicitação, execução de fluxos, automações e conectores do formulário.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Progresso parcial',
            text: '`POST /responses/progress` grava respostas parciais em `submission_progress` (respostas por campo + seções visitadas). Serve para retomar o preenchimento e para automações de "seção alcançada" — não é uma resposta enviada.',
          },
        ],
      },
      {
        id: 'exportacao',
        title: 'Exportação',
        blocks: [
          {
            kind: 'list',
            items: [
              'CSV é gerado em streaming (`Readable`), adequado a volumes grandes.',
              'XLSX e PDF são montados em memória e devolvidos como buffer.',
              'Exportar exige `responses.export`; apenas listar exige `responses.view`.',
              'Toda exportação emite `responses.exported` e fica registrada na auditoria com o formato e a quantidade.',
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Campos sensíveis',
            text: 'A permissão `responses.view_sensitive` é o que libera a leitura de campos marcados como sensíveis. Sem ela, o conteúdo é ocultado também nas exportações.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'endpoints-responses',
        title: 'Endpoints',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/responses/submit', description: 'Envia uma resposta.', public: true, rateLimit: '10/min' },
              { method: 'POST', path: '/responses/progress', description: 'Salva o progresso parcial do preenchimento.', public: true, rateLimit: '60/min' },
              { method: 'GET', path: '/responses/:id', description: 'Detalhe de uma resposta. Lista e exportação ficam no módulo Registros (/records/form/:formId).', permission: 'responses.view_detail' },
            ],
          },
          { kind: 'events', emits: ['responses.submitted', 'responses.exported'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'submissions',
                entity: 'SubmissionEntity',
                description: 'Cabeçalho da resposta: quem respondeu, quando, de qual IP e contra qual versão.',
              },
              {
                table: 'submission_items',
                entity: 'SubmissionItemEntity',
                description: 'Valor por campo, tipado em colunas separadas (`value_text`, `value_number`, `value_boolean`, `value_json`).',
              },
              {
                table: 'submission_progress',
                entity: 'SubmissionProgressEntity',
                description: 'Preenchimento em andamento: respostas por campo e seções visitadas.',
              },
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/responses/responses.service.ts', note: 'envio e exportações' },
              { path: 'backend/src/modules/responses/form-submission.validator.ts', note: 'validação e normalização' },
              { path: 'backend/src/modules/responses/public-captcha.service.ts', note: 'Turnstile' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'kanban-fases',
    title: 'Fases do Kanban',
    group: 'formularios',
    icon: Columns3,
    summary:
      'Colunas configuráveis por formulário, com campos próprios preenchidos na passagem de fase.',
    tags: ['kanban', 'fase', 'coluna', 'quadro', 'etapa'],
    sourcePaths: {
      backend: 'backend/src/modules/kanban-phases',
      frontend: 'frontend/src/modules/kanban-phases',
    },
    uiRoutes: ['/kanban', '/kanban/:formId'],
    primary: [
      {
        id: 'conceito',
        title: 'Fases por formulário',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O status de uma solicitação (`new`, `in_analysis`, `completed`…) é global e fixo no código. As **fases** são a camada configurável por cima disso: cada formulário define suas próprias colunas, com rótulo, cor, ordem e a marcação de fase terminal.',
          },
          {
            kind: 'paragraph',
            text: 'Cada fase pode ter campos próprios — quase os mesmos tipos dos formulários (sem "Cálculo" nem Lista/Tabela do ERP), mais título, texto explicativo e divisor. Quem atua na fase preenche esses campos no card; os valores ficam em `kanban_phase_field_values`, vinculados à solicitação, e os fluxos enxergam cada um pelo código (variável e condição). "Obrigatório" é conferido no card e no backend (checkbox obrigatório = precisa estar marcado).',
          },
          {
            kind: 'paragraph',
            text: 'Não existe mais Kanban por status: todo formulário nasce com três fases — **Novo**, **Pendente** e **Concluído** (fase final) — e precisa manter pelo menos uma. Duplicar um formulário copia as fases (com os campos) do original. Solicitações sem formulário aparecem no quadro "Sem formulário", com as mesmas três colunas calculadas pelo status; mover ali grava o status equivalente (`new`, `in_progress`, `completed`).',
          },
          {
            kind: 'list',
            items: [
              '**Configurar fase** (engrenagem no card da fase, no construtor → Fases): abas Geral (nome, cor, legenda, fase final), Acesso e aprovação, Campos (lista com seletor visual de tipo, opções com valor estável e "Colar lista") e Automações (fluxos que reagem à fase). "Aplicar" muda o rascunho; "Salvar fases" grava.',
              '**Quem vê a fase no Kanban**: todos com acesso ou só perfis, áreas e/ou usuários escolhidos (basta casar um). Coluna e cards somem para os demais; quem gerencia fases (`kanban_phases.manage`) vê todas, marcadas com um olho cortado. Esconder não impede enviar cards para a fase.',
              '**Quem atua** (preenche campos, pede aprovação) e **quem aprova** a saída da fase: vários perfis e/ou usuários. Para atuar o perfil precisa de `solicitations.manage` (qualquer escopo); para aprovar, `approvals.decide`.',
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Salvamento é substituição completa',
            text: '`PUT /forms/:formId/kanban-phases` grava o conjunto inteiro de fases de uma vez. A tela envia sempre a configuração completa, não um delta.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-kanban',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/forms/:formId/kanban-phases', description: 'Fases configuradas, com seus campos.' },
              { method: 'PUT', path: '/forms/:formId/kanban-phases', description: 'Substitui a configuração de fases do formulário.', permission: 'kanban_phases.manage' },
              { method: 'GET', path: '/areas/options', description: 'Áreas ativas (id e nome) para o "Quem vê a fase".', permission: 'kanban_phases.manage' },
              { method: 'GET', path: '/solicitations/:id/phase-fields', description: 'Valores dos campos de fase de uma solicitação.' },
              { method: 'PATCH', path: '/solicitations/:id/phase-fields', description: 'Grava os valores dos campos de fase.', permission: 'solicitations.manage' },
              { method: 'PATCH', path: '/solicitations/:id/move-phase', description: 'Move o card para outra fase.', permission: 'solicitations.manage' },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'kanban_phases',
                entity: 'KanbanPhaseEntity',
                description: 'Coluna do quadro de um formulário.',
                columns: [
                  { name: 'key', type: 'varchar', note: 'identificador estável usado pelos fluxos' },
                  { name: 'is_terminal', type: 'boolean', note: 'encerra o acompanhamento do card' },
                  { name: 'actors', type: 'jsonb', note: 'quem atua: { roleCodes, userIds }' },
                  { name: 'approvers', type: 'jsonb', note: 'quem aprova: { roleCodes, userIds }' },
                  { name: 'visible_to', type: 'jsonb', note: 'quem vê no Kanban: { roleCodes, areaIds, userIds }; nulo = todos' },
                  { name: 'actor_role_code / approver_role_code', type: 'varchar', note: 'legado: primeiro perfil, mantido para o app móvel' },
                ],
              },
              {
                table: 'kanban_phase_fields',
                entity: 'KanbanPhaseFieldEntity',
                description: 'Campo preenchido no card enquanto ele está na fase; reaproveita os tipos de `FormFieldType`.',
              },
              {
                table: 'kanban_phase_field_values',
                entity: 'KanbanPhaseFieldValueEntity',
                description: 'Valor preenchido por solicitação.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'automacoes',
    title: 'Automações de formulário',
    group: 'formularios',
    icon: Wand2,
    summary:
      'Regras simples "se o campo X, então avise/envie" ligadas a um formulário — a alternativa leve aos fluxos.',
    tags: ['automação', 'regra', 'condição', 'ação', 'e-mail'],
    sourcePaths: { backend: 'backend/src/modules/automations', frontend: 'frontend/src/modules/automations' },
    primary: [
      {
        id: 'quando-usar',
        title: 'Quando usar automação em vez de fluxo',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Automação é uma regra plana presa a um formulário: um gatilho, um conjunto de condições sobre os campos respondidos e uma lista de ações. Não tem grafo, ramificação nem integração com ERP. É a ferramenta certa para "quando esse campo vier assim, avise fulano".',
          },
          {
            kind: 'table',
            columns: ['Precisa de…', 'Use'],
            rows: [
              ['Aviso simples condicionado a um campo', 'Automação'],
              ['Ramificação, várias etapas, aprovação', 'Fluxo'],
              ['Chamada a ERP, WhatsApp, planilha', 'Fluxo'],
              ['Disparo por webhook, SLA ou agendamento', 'Fluxo'],
            ],
          },
          {
            kind: 'list',
            items: [
              'Gatilhos: envio da resposta (`on_submission`) e alcance de uma seção durante o preenchimento.',
              'Operadores de condição: `equals`, `not_equals`, `contains`, `is_empty`, `is_not_empty`.',
              'Ações: `send_email`, `webhook` e `notify_users`, com interpolação de variáveis da resposta.',
              'Cada disparo grava um registro em `automation_executions` com status, ações executadas e erro.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-automacoes',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/forms/:formId/automations', description: 'Regras do formulário.', permission: 'automations.manage' },
              { method: 'POST', path: '/forms/:formId/automations', description: 'Cria regra.', permission: 'automations.manage' },
              { method: 'PATCH', path: '/automations/:id', description: 'Atualiza regra.', permission: 'automations.manage' },
              { method: 'DELETE', path: '/automations/:id', description: 'Remove regra.', permission: 'automations.manage' },
              { method: 'GET', path: '/automations/:id/executions', description: 'Histórico de execuções da regra.', permission: 'automations.manage' },
            ],
          },
          { kind: 'events', listens: ['responses.submitted'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'automation_rules',
                entity: 'AutomationRuleEntity',
                description: 'Regra do formulário: gatilho, alvo (seção ou fase), condições e ações em `jsonb`.',
              },
              {
                table: 'automation_executions',
                entity: 'AutomationExecutionEntity',
                description: 'Registro de cada disparo, com as ações efetivamente executadas.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'conectores-formulario',
    title: 'Conectores de formulário',
    group: 'formularios',
    icon: ClipboardList,
    summary:
      'Encaminhamento automático de cada resposta para um destino externo: planilha, webhook, e-mail ou API REST.',
    tags: ['conector', 'webhook', 'google sheets', 'integração de formulário'],
    sourcePaths: { backend: 'backend/src/modules/connectors', frontend: 'frontend/src/modules/connectors' },
    primary: [
      {
        id: 'conceito-conectores',
        title: 'Como funciona',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Um conector é um destino configurado no formulário. Quando uma resposta é enviada, o `ConnectorsListener` escuta `responses.submitted` e entrega a resposta para cada conector ativo daquele formulário, em um formato normalizado (`ConnectorPayload`: formulário, resposta, respondente e lista de campos com código, rótulo e valor).',
          },
          {
            kind: 'table',
            columns: ['Tipo', 'Destino'],
            rows: [
              ['`google_sheets`', 'Linha em uma planilha do Google'],
              ['`webhook`', 'POST para uma URL externa'],
              ['`email`', 'Envio por e-mail'],
              ['`rest_api`', 'Chamada REST genérica'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Conector ≠ conector ERP',
            text: 'Estes conectores pertencem ao formulário e são disparados por resposta. Os conectores ERP são outro módulo: pertencem à administração, têm credenciais criptografadas e são chamados por nós de fluxo.',
          },
          {
            kind: 'list',
            items: [
              '`POST /connectors/:id/test` valida a configuração sem depender de uma resposta real.',
              '`last_sync_at` e `last_sync_status` no registro mostram o resultado da última entrega.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-conectores',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/forms/:formId/connectors', description: 'Conectores do formulário.', permission: 'integrations.manage_channels' },
              { method: 'POST', path: '/forms/:formId/connectors', description: 'Cria conector.', permission: 'integrations.manage_channels' },
              { method: 'PATCH', path: '/connectors/:id', description: 'Atualiza conector.', permission: 'integrations.manage_channels' },
              { method: 'DELETE', path: '/connectors/:id', description: 'Remove conector.', permission: 'integrations.manage_channels' },
              { method: 'POST', path: '/connectors/:id/test', description: 'Testa a configuração.', permission: 'integrations.manage_channels' },
            ],
          },
          { kind: 'events', listens: ['responses.submitted'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'form_connectors',
                entity: 'FormConnectorEntity',
                description: 'Destino configurado no formulário; `config` em `jsonb` varia conforme o tipo.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'analytics',
    title: 'Painel de indicadores',
    group: 'formularios',
    icon: BarChart3,
    summary: 'Painel montado pelo próprio usuário com os indicadores que importam para aquele formulário.',
    tags: ['analytics', 'dashboard', 'painel', 'indicador', 'widget', 'estatística', 'métrica de formulário', 'gráfico'],
    sourcePaths: { backend: 'backend/src/modules/dashboards', frontend: 'frontend/src/modules/dashboards' },
    primary: [
      {
        id: 'analytics-uso',
        title: 'O que mostra',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Enquanto o Dashboard responde "como está a operação", este painel responde "como está este formulário" — com a diferença de que **quem escolhe os indicadores é o usuário**, não o código. Ele vive na aba Analytics do builder e substituiu a visão automática que existia ali.',
          },
          {
            kind: 'paragraph',
            text: 'Cada bloco é um indicador em um de quatro formatos: número em destaque (`kpi`), distribuição por opção (`categorias`), evolução no tempo (`serie`) e valores mais frequentes (`ranking`). O tipo do campo determina quais formatos e agregações aparecem no seletor — média de CPF não é oferecida, e a API recusa se for forjada.',
          },
          {
            kind: 'paragraph',
            text: 'Uma agregação foge da regra das outras: a **taxa**. Ela não resume valores, mede preenchimento — sem campo escolhido é a taxa de conclusão do formulário (quantas submissões chegaram com alguma resposta), e com campo é a taxa de preenchimento daquele campo. Nos dois casos o denominador é o total de submissões do período, nunca o total de itens; contar só quem respondeu daria 100% sempre. O resultado vem marcado com `unidade: "percentual"`, e é isso que faz o número sair com "%" na tela.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'A taxa só existe como número único',
            text: 'Em série temporal ela viraria um percentual por dia, que não é o que a pergunta pede — a API recusa a combinação e o seletor da tela nem a oferece. A taxa de conclusão sem campo é a herdeira direta do indicador que a aba Analytics antiga mostrava, e entra por padrão no painel sugerido.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Formulário sem painel não fica sem indicador',
            text: 'Quando ninguém montou um painel ainda, o backend devolve uma sugestão construída na hora a partir dos campos existentes (`gerado: true`), com volume total, recorte recente, evolução no tempo e os campos que rendem gráfico. Salvar essa sugestão é o que a torna um painel de verdade.',
          },
          {
            kind: 'paragraph',
            text: 'Os números são calculados **ao vivo** a cada abertura, sem cache: o painel nunca mostra dado velho. O filtro de período no topo, quando escolhido, sobrepõe o período de todos os blocos de uma vez.',
          },
        ],
      },
      {
        id: 'analytics-permissao',
        title: 'Quem vê e quem monta',
        blocks: [
          {
            kind: 'table',
            columns: ['Ação', 'Permissão'],
            rows: [
              ['Ver o painel', '`analytics.view` — a mesma que abria o analytics antigo'],
              ['Montar, editar e excluir', '`dashboards.manage` — semeada para admin e gestor'],
            ],
          },
          {
            kind: 'paragraph',
            text: 'Quem só lê recebe o painel com `podeEditar: false` e não vê os controles de edição. Como a leitura passa pelo mesmo filtro de escopo do formulário, duas pessoas abrindo o mesmo painel podem ver números diferentes se enxergam formulários diferentes — o que é o comportamento correto.',
          },
        ],
      },
      {
        id: 'analytics-paineis-livres',
        title: 'Painéis livres',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O painel da aba Analytics nasce de um formulário e pertence a ele. O **painel livre** é a outra metade: nasce de uma pessoa, cruza os formulários que ela escolher e vive em **Painéis**, na barra lateral. Os dois dividem a mesma tabela e o mesmo motor — o que os separa é `dashboards.form_id` estar preenchido ou nulo.',
          },
          {
            kind: 'paragraph',
            text: 'Como não há um formulário só, **cada bloco carrega o seu** em `config_json.formId`, e é ele que diz de onde o número vem. Um bloco sem formulário não chega ao motor: falha no próprio card dizendo isso.',
          },
          {
            kind: 'table',
            columns: ['Ação', 'Quem pode'],
            rows: [
              ['Ver a lista e abrir um painel publicado', '`analytics.view`'],
              ['Criar painel', '`dashboards.manage`'],
              ['Editar, publicar e excluir', 'O dono — ou quem tem `dashboards.manage` com escopo `all`'],
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Publicar torna o painel visível, não os dados dele',
            text: 'Quem abre um painel alheio é quem paga o pedágio de acesso: cada bloco é calculado com a identidade de quem abre, pela mesma regra de acesso do processo de origem ("ver o painel" no vínculo com ele). Um bloco sobre formulário que a pessoa não enxerga volta com "Acesso negado" no próprio card, e o resto do painel continua. Não existe caminho em que publicar vaze número.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Painel privado alheio responde 404, não 403',
            text: 'Um 403 confirmaria que o painel existe — que é justamente o que não se quer contar para quem não deveria saber dele.',
          },
        ],
      },
      {
        id: 'analytics-filtros-globais',
        title: 'Filtros globais',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Área e status ficam na barra do topo do painel livre, ao lado do período — nunca são escolhidos dentro do editor de um bloco. O que muda entre os três é o alcance: período sobrepõe o de cada bloco, área e status filtram por cima do que já existe.',
          },
          {
            kind: 'table',
            columns: ['Filtro', 'Efeito em blocos de respostas', 'Efeito em blocos de solicitações'],
            rows: [
              ['Área', 'O bloco é de um formulário só: se ele não é daquela área, o bloco não contribui nada — mesmo tratamento que um período sem dado, não um erro.', 'Filtra `solicitation.area_id` diretamente, já que uma consulta de solicitações cruza vários formulários.'],
              ['Status', 'Não se aplica — forms não têm um status de fila equivalente. O bloco continua igual.', 'Filtra `solicitation.status`.'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Área lista só o que o motor sabe filtrar',
            text: '`GET /dashboards/areas` devolve as áreas ativas, e `GET /dashboards/solicitacoes/status` os status do fluxo do kanban — as duas listas que alimentam os seletores da barra, gated só por `analytics.view`, não por `areas.manage`.',
          },
        ],
      },
      {
        id: 'analytics-grade-livre',
        title: 'Grade livre e redimensionável',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada bloco tem posição (`x`, `y`) e tamanho (`w`, `h`) próprios, numa grade de 12 colunas — não é mais uma largura de 1 ou 2 colunas empilhada por ordem. Em modo de edição, a alça no canto superior esquerdo do card move o bloco para qualquer lugar; o canto inferior direito redimensiona.',
          },
          {
            kind: 'paragraph',
            text: 'É posicionamento **livre** de verdade: a grade não recompacta os blocos depois de mover ou redimensionar — um espaço vazio continua vazio até alguém preencher, e dois blocos podem temporariamente se sobrepor depois de um redimensionamento maior, até a pessoa arrastar um deles para o lugar. Isso é escolha, não bug: um comportamento que reorganiza tudo sozinho brigaria com a ideia de dar controle total à pessoa que está montando o painel.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Um bloco novo nasce abaixo de tudo, nunca em cima',
            text: 'Ao adicionar um indicador, a posição inicial é calculada — não fixa em (0,0) — encostada à esquerda, na primeira linha livre abaixo do que já existe. Editar um bloco existente preserva onde ele já estava.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'A sugestão automática também nasce com layout',
            text: 'Um formulário sem painel salvo recebe uma sugestão montada na hora — e ela já vem empacotada pela mesma regra (kpi compacto, gráfico mais largo, quebra de linha), não em (0,0) sobreposta. Backend em `grid-layout.util.ts`.',
          },
        ],
      },
      {
        id: 'analytics-fonte-solicitacoes',
        title: 'Blocos sobre solicitações',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Um bloco de painel livre escolhe a **fonte** antes de tudo. `respostas` lê o que as pessoas preencheram; `solicitacoes` lê a fila de trabalho — e aí a dimensão não é um campo de formulário, é uma coluna da solicitação.',
          },
          {
            kind: 'table',
            columns: ['Agrupar por', 'Formato preferido'],
            rows: [
              ['Status, Prioridade, Situação do prazo', 'Distribuição — escolha fechada, poucas categorias'],
              ['Área, Responsável, Formulário de origem', 'Ranking — nome livre, ordenado e cortado pelo limite'],
              ['Nada (a fila inteira)', 'Número único ou evolução no tempo'],
            ],
          },
          {
            kind: 'table',
            columns: ['Medida', 'O que calcula'],
            rows: [
              ['Quantidade de solicitações', 'Contagem simples.'],
              ['Taxa de conclusão', 'Concluídas sobre o total do período.'],
              ['Prazo cumprido', 'Entre as que **tinham prazo**, as que não o estouraram. Sem prazo não há o que cumprir, e incluí-las inflaria o indicador.'],
              ['Tempo médio em aberto', 'Horas médias desde a criação, **só das que ainda não terminaram** — a idade de uma solicitação concluída não é tempo de fila, é história.'],
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'A regra de acesso desta fonte é outra',
            text: 'Respostas passam por `analytics.view` do formulário; solicitações passam por `solicitations.view`, com o mesmo filtro de escopo da lista e do kanban — e pelo mesmo helper, não por uma reimplementação. Quem enxerga três solicitações na tela vê indicador de três, não da empresa toda. É por isso que existem dois motores em vez de um com um `if`.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Distribuição e ranking só contam',
            text: 'Taxa, prazo e tempo médio resumem o conjunto: por categoria, num gráfico de barras, não diriam nada. A API recusa a combinação e o seletor da tela não a oferece.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-analytics',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              {
                method: 'GET',
                path: '/forms/:formId/dashboard',
                description: 'Painel com os indicadores calculados. Aceita `periodoDias` para valer no painel inteiro.',
                permission: 'analytics.view',
              },
              {
                method: 'GET',
                path: '/forms/:formId/dashboard/campos',
                description: 'Campos que podem virar indicador, com formatos e agregações válidos de cada um.',
                permission: 'analytics.view',
              },
              {
                method: 'POST',
                path: '/forms/:formId/dashboard/previsualizar',
                description: 'Calcula um indicador sem gravar — alimenta a pré-visualização do editor.',
                permission: 'dashboards.manage',
              },
              {
                method: 'PUT',
                path: '/forms/:formId/dashboard',
                description: 'Cria ou substitui o painel inteiro; o que não vier na lista é removido.',
                permission: 'dashboards.manage',
              },
              {
                method: 'DELETE',
                path: '/forms/:formId/dashboard',
                description: 'Remove o painel; os blocos caem por cascade.',
                permission: 'dashboards.manage',
              },
              {
                method: 'GET',
                path: '/dashboards',
                description: 'Painéis livres: os próprios e os que outras pessoas publicaram.',
                permission: 'analytics.view',
              },
              {
                method: 'GET',
                path: '/dashboards/formularios',
                description: 'Formulários que o usuário pode usar como fonte de um bloco.',
                permission: 'analytics.view',
              },
              {
                method: 'GET',
                path: '/dashboards/areas',
                description: 'Áreas ativas para o filtro global do painel.',
                permission: 'analytics.view',
              },
              {
                method: 'GET',
                path: '/dashboards/solicitacoes/status',
                description: 'Status do fluxo do kanban, para o filtro global do painel.',
                permission: 'analytics.view',
              },
              {
                method: 'GET',
                path: '/dashboards/solicitacoes/dimensoes',
                description: 'Dimensões e medidas da fonte de solicitações — o análogo dos campos.',
                permission: 'analytics.view',
              },
              {
                method: 'POST',
                path: '/dashboards/previsualizar',
                description: 'Calcula um bloco sem gravar. A fonte decide o motor: respostas exige formId no corpo, solicitações não.',
                permission: 'analytics.view',
              },
              {
                method: 'POST',
                path: '/dashboards',
                description: 'Cria um painel livre. Nasce privado.',
                permission: 'dashboards.manage',
              },
              {
                method: 'GET',
                path: '/dashboards/:id',
                description: 'Abre um painel livre com os blocos calculados. Aceita `periodoDias`, `areaId` e `status` — valem para o painel inteiro.',
                permission: 'analytics.view',
              },
              {
                method: 'PUT',
                path: '/dashboards/:id',
                description: 'Substitui nome, descrição e blocos; o que não vier na lista é removido.',
                permission: 'dashboards.manage',
              },
              {
                method: 'POST',
                path: '/dashboards/:id/publicar',
                description: 'Publica para a organização, ou volta a privado.',
                permission: 'dashboards.manage',
              },
              {
                method: 'DELETE',
                path: '/dashboards/:id',
                description: 'Exclui o painel livre; os blocos caem por cascade.',
                permission: 'dashboards.manage',
              },
              {
                method: 'GET',
                path: '/forms/:id/analytics',
                description: 'Visão automática anterior. Sem consumidor na interface desde a troca da aba, mantida por ser superfície pública de API.',
                permission: 'analytics.view',
              },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'dashboards',
                entity: 'DashboardEntity',
                description:
                  'Painel de formulário (form_id preenchido, um por formulário) e painel livre (form_id nulo, de uma pessoa). O único em form_id é parcial, para não valer entre os livres; published_at nulo é privado.',
              },
              {
                table: 'dashboard_widgets',
                entity: 'DashboardWidgetEntity',
                description:
                  'Cada bloco, com a configuração em config_json e o layout livre (x, y, w, h — grade de 12 colunas). position segue existindo como desempate estável, não decide mais onde o bloco fica.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'A configuração é revalidada em toda leitura',
            text: 'O formulário muda depois que o painel foi montado. Se um campo referenciado por um bloco for removido, aquele bloco devolve o erro no próprio card — os outros continuam funcionando, e nenhum número errado é exibido no lugar.',
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/dashboards/widget-query.service.ts', note: 'motor: configuração → SQL agregado' },
              { path: 'backend/src/modules/dashboards/dashboards.service.ts', note: 'persistência, sugestão e cálculo ao vivo' },
              { path: 'backend/src/modules/dashboards/paineis-livres.service.ts', note: 'painéis livres: acesso por bloco e publicação' },
              { path: 'backend/src/modules/dashboards/solicitacao-query.service.ts', note: 'motor da fonte de solicitações: dimensões, SLA e escopo' },
              { path: 'backend/src/modules/dashboards/grid-layout.util.ts', note: 'empacotador da grade livre — tamanho por formato, quebra de linha' },
              { path: 'frontend/src/modules/dashboards/components/widget-grid.tsx', note: 'grade livre e redimensionável, via react-grid-layout' },
              { path: 'frontend/src/modules/dashboards/', note: 'editor, grade e gráficos' },
            ],
          },
        ],
      },
    ],
  },
];
