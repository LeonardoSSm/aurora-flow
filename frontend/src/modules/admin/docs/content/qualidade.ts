import { FlaskConical } from 'lucide-react';
import type { DocArticle, DocSection } from '../../../docs-kit';

/**
 * Inventário dos testes automatizados do repositório.
 *
 * É dado estruturado, não texto solto, por dois motivos: as tabelas do artigo
 * são geradas daqui (sem risco de a soma da tabela divergir do total escrito ao
 * lado), e `__tests__/test-inventory.test.ts` confere contra o disco que todo
 * arquivo listado existe e que todo arquivo de teste do repositório está
 * listado. Renomear ou apagar um spec sem atualizar esta lista quebra o build.
 *
 * As contagens vêm da saída dos próprios runners (`jest --json` e
 * `vitest --reporter=json`), não de contagem manual de `it(` — `it.each`
 * expande em vários testes.
 */
export type TestGroup = {
  id: string;
  label: string;
  /** O que este grupo protege, em uma linha. */
  focus: string;
  files: Array<{ path: string; tests: number; covers: string }>;
};

export type TestSuite = {
  id: string;
  label: string;
  runner: string;
  command: string;
  /** Onde o runner procura os arquivos. */
  pattern: string;
  groups: TestGroup[];
};

export const BACKEND_SUITE: TestSuite = {
  id: 'backend',
  label: 'Backend (unitário)',
  runner: 'Jest + ts-jest',
  command: 'npm --prefix backend test',
  pattern: 'backend/src/**/*.spec.ts',
  groups: [
    {
      id: 'nucleo',
      label: 'Núcleo, segurança e utilitários',
      focus: 'O que todo módulo usa: escopo de permissão, criptografia, validação de formato e o motor de fórmulas.',
      files: [
        {
          path: 'common/validators/field-format.validator.spec.ts',
          tests: 64,
          covers: 'CPF, CNPJ, CEP, telefone, e-mail e valor monetário — dígitos verificadores e formatos aceitos',
        },
        {
          path: 'common/crypto/token-cipher.service.spec.ts',
          tests: 12,
          covers: 'Cifragem e decifragem dos tokens de integração guardados no banco',
        },
        {
          path: 'common/formula/formula.engine.spec.ts',
          tests: 30,
          covers:
            'Parser e avaliador dos campos calculados, incluindo encadeamento, referência circular e SOMAPRODUTO/SOMAQUOCIENTE sobre colunas de uma tabela de produtos; campo Hora em horas e DURACAO entre chegada e saída (passa da meia-noite, horário em branco deixa em branco) e o formato 8h30; "Total de horas" × valor da hora fecha no centavo (horas guardadas com todas as casas)',
        },
        {
          path: 'common/formula/score-ranges.spec.ts',
          tests: 15,
          covers:
            'Pontuação no campo calculado: pontos por opção (null = não conta), CONFORMIDADE por seção, ATINGIRAM (% das seções iguais ou acima do marco, seção sem nota fora) e MEDIAPREENCHIDOS; faixas do resultado (a partir de X até a próxima)',
        },
        {
          path: 'common/utils/dot-path.spec.ts',
          tests: 13,
          covers: '`resolvePath` e `resolveEmailList` — leitura de caminhos aninhados em payloads de fluxo',
        },
        {
          path: 'common/helpers/requester-contact.helper.spec.ts',
          tests: 9,
          covers: 'Extração de nome/e-mail/telefone do solicitante a partir das respostas, quando a submissão é anônima; ignora campos de outra pessoa ("E-mail Gestor Imediato" antes do "Seu E-mail") e prefere o rótulo "seu/do solicitante" ao neutro; "E-mail de usuário" (sugere gente do sistema) não vira contato, salvo rótulo "seu e-mail"',
        },
        {
          path: 'modules/user-email/user-email-field.service.spec.ts',
          tests: 10,
          covers: 'Campo "E-mail de usuário": leitura da configuração (ids inválidos/repetidos saem), formulário publicado recebe nome + e-mail das pessoas ativas no lugar dos ids, pesquisa pública só entre as escolhidas ou entre todos os ativos (mínimo de 3 letras, sem acento, curinga escapado, teto de 8) e a trava "só e-mails sugeridos" (maiúscula/espaço não importam; e-mail de fora, inativo ou não escolhido recusado)',
        },
        {
          path: 'common/crypto/hmac.service.spec.ts',
          tests: 4,
          covers: 'Assinatura e verificação HMAC dos webhooks de saída',
        },
        {
          path: 'common/guards/permissions.guard.spec.ts',
          tests: 8,
          covers: 'O guard que traduz `@RequirePermission` em 403',
        },
        { path: 'app.controller.spec.ts', tests: 1, covers: 'Rota raiz de saúde da aplicação' },
      ],
    },
    {
      id: 'formularios',
      label: 'Formulários e respostas',
      focus: 'Versionamento, visibilidade por linha, validação da submissão e mascaramento de campo sensível.',
      files: [
        {
          path: 'modules/records/record-report.spec.ts',
          tests: 15,
          covers:
            'Registros: valor de cada coluna como a tela mostra (rótulo da opção, data, moeda, sim/não, calculado, tabela do ERP/pedido de itens numa linha), um campo por código entre versões com sensível mascarado e sem filtro, campos de fase na ordem do Kanban; montagem do relatório (configuração validada, ordenação com vazio no fim, grupos por fase na ordem do Kanban, coluna do grupo fora da tabela, títulos trocados) e geração de um PDF de verdade em tabela e ficha; filtro de texto aceitando data/número brasileiro; célula de CSV com ";" e fórmula neutralizada',
        },
        {
          path: 'modules/responses/responses.service.spec.ts',
          tests: 31,
          covers:
            'Validação estrutural do envio, `findOne` e `resolveExportCellValue` (usado pelos relatórios do Registros) — troca o internalValue de seleção pelo rótulo e formatam o campo calculado, em vez de vazar o dado bruto; e o bloqueio de IDOR em `findOne` — usuário sem atribuição/escopo sobre o formulário não lê a resposta só por saber o UUID; "Lista do ERP": grava o que a conferência no ERP devolve (não o que o navegador mandou) e, com o ERP fora, nada é gravado; "Identificação obrigatória": envio sem nome/e-mail volta 422 sem gravar nada, com usuário logado (app) grava o nome e o e-mail dele, e sem a opção o envio anônimo continua anônimo mesmo logado; "E-mail de usuário" com "só e-mails sugeridos": e-mail de fora volta 422 no campo sem gravar nada',
        },
        {
          path: 'modules/responses/responder-identification.spec.ts',
          tests: 14,
          covers:
            'Regras puras da "Identificação obrigatória": só `true` liga a opção (formulário antigo segue anônimo), apara espaços, o usuário logado só preenche quando a opção está ligada e o campo veio em branco (o que foi digitado vale mais), exige nome e e-mail e recusa e-mail mal formado',
        },
        {
          path: 'modules/forms/form-download.spec.ts',
          tests: 11,
          covers:
            'Campo "Arquivo para baixar": tipo pelo conteúdo (PDF/PNG/JPG pelos bytes; Word/Excel/ODF só se o ZIP/OLE bater com a extensão; HTML/SVG/executável recusados), nome limpo no disco (acento fica, `..`/barra/ponto inicial saem), `downloadFile` só com caminho gerado pelo servidor (URL externa e `..` recusadas), normalização no salvar, campo sem arquivo barrado na publicação e limites de tamanho/vazio',
        },
        {
          path: 'modules/forms/public-form-files.service.spec.ts',
          tests: 4,
          covers: 'Rejeita upload cujo conteúdo real (magic bytes) não bate com a extensão declarada — ex.: HTML disfarçado de imagem',
        },
        {
          path: 'modules/forms/domain/form.aggregate.spec.ts',
          tests: 31,
          covers: 'Regras do agregado: publicar versão, arquivar e duplicar',
        },
        {
          path: 'modules/forms/form-row-level-security.spec.ts',
          tests: 9,
          covers: 'Quem enxerga e edita cada formulário, incluindo o desvio por atribuição',
        },
        {
          path: 'modules/forms/forms.service.spec.ts',
          tests: 22,
          covers: 'Versionamento inteligente no update, transação do status, projeção da lista e acesso dado na criação às pessoas informadas (vínculo, com quem cria como gestor)',
        },
        {
          path: 'modules/forms/form-version.writer.spec.ts',
          tests: 14,
          covers:
            'Posição da seção no canvas do fluxo e configurações da versão (modo do formulário, identificação opcional) não entram no hash de estrutura — mudar qualquer um dos dois não cria versão nova, mas ainda assim é gravado; mudança de estrutura de verdade continua criando/substituindo versão como sempre; e que o hash não depende da ordem das chaves do jsonb (Postgres reordena, JSON.stringify cru não é seguro) — o bug que fazia todo salvamento recriar a versão inteira mesmo sem mudança nenhuma',
        },
        {
          path: 'modules/responses/responses-masking.spec.ts',
          tests: 10,
          covers: '`maskSensitiveValues` — troca por `***` para quem não tem `responses.view_sensitive`',
        },
        {
          path: 'modules/responses/form-submission.validator.spec.ts',
          tests: 18,
          covers: 'Caminhada no grafo de seções (campo de seção pulada não é exigido), recálculo dos campos de fórmula, anexo obrigatório e a "Lista do ERP" (só o código entra; obrigatório sem escolha e formato errado)',
        },
        {
          path: 'modules/forms/form-definition.utils.spec.ts',
          tests: 7,
          covers: '`hasOrphanedSectionRules` — bloqueia publicar com regra de fluxo apontando para o vazio',
        },
        {
          path: 'modules/analytics/analytics.service.spec.ts',
          tests: 11,
          covers: 'Acesso ao analytics de um formulário atribuído e a agregação por campo em SQL',
        },
        {
          path: 'modules/responses/submission-progress.service.spec.ts',
          tests: 4,
          covers: 'Registro de progresso parcial no preenchimento por etapas',
        },
      ],
    },
    {
      id: 'dashboards',
      label: 'Construtor de dashboards',
      focus:
        'O motor que traduz configuração de widget em consulta agregada, a persistência do painel do formulário e a dos painéis livres.',
      files: [
        {
          path: 'modules/dashboards/widget-query.service.spec.ts',
          tests: 49,
          covers: 'Validação da configuração, garantia de que nada do cliente vira SQL, os quatro formatos, a taxa de conclusão, o acesso e a segunda métrica combinada em série/categorias/ranking',
        },
        {
          path: 'modules/dashboards/dashboards.service.spec.ts',
          tests: 20,
          covers:
            'Permissão de gestão, substituição do painel, falha de widget contida no próprio bloco, e que a sugestão automática já nasce com layout — sem sobreposição, sem estourar as 12 colunas',
        },
        {
          path: 'modules/dashboards/grid-layout.util.spec.ts',
          tests: 9,
          covers:
            'O empacotador da grade livre: tamanho por formato, quebra de linha quando estoura as 12 colunas, altura da próxima linha respeitando o bloco mais alto da anterior, e nenhum par de blocos sobreposto',
        },
        {
          path: 'modules/dashboards/solicitacao-query.service.spec.ts',
          tests: 23,
          covers:
            'Motor da fonte de solicitações: combinação sem significado recusada antes de virar consulta, filtro de escopo sempre aplicado, e os códigos do banco chegando à tela com o nome que a pessoa reconhece',
        },
        {
          path: 'modules/dashboards/paineis-livres.service.spec.ts',
          tests: 24,
          covers:
            'Painéis que cruzam formulários: que painel privado alheio devolva 404 e não 403, que publicar não publique os dados (cada bloco é calculado com a identidade de quem abre) e que bloco quebrado não derrube o painel',
        },
      ],
    },
    {
      id: 'processos',
      label: 'Solicitações, SLA, aprovações e anexos',
      focus: 'A máquina de estados operacional e tudo que pendura nela.',
      files: [
        {
          path: 'modules/approvals/approvals.service.spec.ts',
          tests: 45,
          covers: 'Criar, aprovar, reprovar e cancelar aprovação, nos modos paralelo e sequencial; quem decide agora numa aprovação (titulares das etapas pendentes + usuários dos perfis, sem externos); várias aprovações: "todos" exige cada aprovador (perfil conta como um), "qualquer um" pula as etapas restantes ao aprovar, "em ordem" segue a ordem pedida e avisa quem tem o perfil da próxima etapa',
        },
        {
          path: 'modules/approvals/approvals-external.service.spec.ts',
          tests: 30,
          covers:
            'Aprovador externo no ApprovalsService: e-mail de usuário ativo vai para o usuário e o resto vira etapa por e-mail (normalizado, sem repetidos, máx. 10, inválido recusado); o link só é emitido DEPOIS do commit e só para etapas pendentes (sequencial: a próxima recebe ao ser ativada); SMTP indisponível recusa ANTES de criar; falha de envio não desfaz a aprovação; decisão externa grava decided_via/e-mail/IP com actorId nulo, no histórico e nos eventos; e-mail diferente do da etapa e etapa de usuário não são decididas por link; reenvio exige approvals.manage',
        },
        {
          path: 'modules/approvals/external/external-approval-token.spec.ts',
          tests: 11,
          covers: 'Token do link de aprovação: 256 bits em base64url (43 caracteres), só o hash SHA-256 é derivado/guardado, sem repetição e descarte de formato inválido (incl. injeção SQL) antes de ir ao banco',
        },
        {
          path: 'modules/approvals/external/external-approval-email.spec.ts',
          tests: 5,
          covers: 'E-mail do link de aprovação: assunto, texto e HTML com o link e a validade em horário de Brasília; tudo que vem de dado é escapado (nada vira marcação) e o assunto é uma linha só',
        },
        {
          path: 'modules/approvals/external/external-approval-link.service.spec.ts',
          tests: 19,
          covers:
            'Emissão e envio do link: grava só o hash (o token do e-mail confere com o hash), cada emissão invalida a anterior, validade de 7 dias configurável (valor inválido volta ao padrão), recusa etapa não externa/decidida/cancelada, retenta uma vez em erro transitório, destinatário recusado pelo SMTP não conta como enviado, sem SMTP em produção devolve falha sem logar o link (em desenvolvimento só loga) e logs sem e-mail nem link',
        },
        {
          path: 'modules/approvals/external/external-approvals.service.spec.ts',
          tests: 25,
          covers:
            'Página pública do link: busca pelo hash, detalhes só quando pendente (e-mail mascarado, respostas filtradas — sem campo sensível, arquivo nem CPF — e ordenadas), estados decidida/expirada/encerrada sem vazar a solicitação, token malformado sem consultar o banco, confirmação de e-mail (maiúsculas/espaços aceitos; 5 erros bloqueiam o link), reprovação exige comentário, IP truncado e corrida entre duas decisões respondida como 410',
        },
        {
          path: 'modules/approvals/external/public-external-approvals.controller.spec.ts',
          tests: 4,
          covers: 'Controller público do link: delega ao serviço, responde com no-store/no-referrer/noindex, repassa o IP da requisição e não tem guarda de autenticação',
        },
        {
          path: 'modules/solicitations/solicitation-transitions.spec.ts',
          tests: 26,
          covers: '`isTransitionAllowed` — transições permitidas, bloqueadas, o atalho para cancelado e a rejeição direta a partir de `new` (fluxos de fase que nunca saem desse status)',
        },
        {
          path: 'modules/solicitations/sla-calculator.service.spec.ts',
          tests: 23,
          covers: 'Prazo por prioridade, horário comercial, feriados e pausa do relógio',
        },
        {
          path: 'modules/kanban-phases/kanban-phases.service.spec.ts',
          tests: 17,
          covers:
            'Gravação das fases: quem atua/aprova com perfis e usuários (sem repetição) e o primeiro perfil copiado nas colunas antigas para o app móvel; cliente antigo (perfil único) continua funcionando; exigir aprovação sem ninguém para aprovar é recusado; cálculo de fase grava a fórmula conferida em R$ (sem fórmula ou com erro é recusado com o nome da fase) e "Valor do card" grava/lê/limpa o código; grava o prazo da fase (horas, úteis, alerta) e sem horas volta ao padrão; grava a regra e a ordem de quem aprova; grava "só avançar com os obrigatórios preenchidos" e "só avançar com responsável", e cliente que não manda as opções (app móvel) mantém o que estava; filtro de cards da fase grava só a própria coluna (na fase daquele processo), lista vazia desliga, regra sem resposta ou sem pessoa é recusada e o "Salvar fases" não mexe no filtro',
        },
        {
          path: 'modules/kanban-phases/phase-section-flow.spec.ts',
          tests: 19,
          covers:
            'Ramificação no formulário da fase: cada "Título" abre uma seção; caminho com ramificação por lista, lista múltipla e caixa de seleção; sem resposta segue o padrão; ciclo não trava; caminho guardado enxuto e referência que não existe (seção, campo, opção, destino) recusada com mensagem',
        },
        {
          path: 'modules/ai-builder/lops-ai-session.service.spec.ts',
          tests: 11,
          covers:
            'Sessão da LOPS IA: token curto tf-XXXX-XXXX-XXXX-XXXX sem letras ambíguas e que não repete; aceita minúsculas, sem hífens e O→0/I→1; abre para usuário ativo do domínio com a permissão e guarda só o hash; recusa outro domínio, e-mail sem usuário e perfil sem permissão; sem chave configurada fica desligada; token mal copiado, desconhecido ou JWT do login não valem; cada uso renova a validade e parada além do prazo cai; trocar a senha derruba a sessão; guard exige chave e token, rota de sessão só a chave, lista de IPs',
        },
        {
          path: 'modules/ai-builder/blueprint/validate-blueprint.spec.ts',
          tests: 18,
          covers:
            'Processo criado pela LOPS IA: o exemplo do manual é válido; referência que não existe vira erro com o caminho; códigos únicos no processo inteiro; chave desconhecida é erro; fase terminal e aprovador cobrados; ramificação só por lista/caixa; seção inalcançável; configuração e fórmula; limites do campo de fase; fluxo com saída de condição, sem ciclo e só nós aceitos; decisões das aprovações num fluxo só com várias entradas, aprovação que move sem conferir o resultado e dois fluxos no mesmo evento recusados, resultado sem saída avisado (condições em paralelo cobrem os dois lados); conversão para formulário, fases (título vira seção) e fluxos (fases viram ids, aviso por perfil vira pessoas)',
        },
        {
          path: 'modules/ai-builder/blueprint/normalize-blueprint.spec.ts',
          tests: 11,
          covers:
            'Processo da LOPS IA "quase certo": o formato que o Gemini mandou (form.type, is_required, config com opções em texto, fase com name, aprovadores soltos, "qualquer um") passa depois de ajustado e cada ajuste volta com o caminho; o formato do manual não muda; processo como texto JSON; códigos gerados sem repetir; ramificação pelo nome da opção e caixa por value; "sem aprovação" e prazo em número; aviso com "to" em texto ou perfis à parte vira lista; fluxos como o Gemini escreveu (tipo de nó, fase, condição, resultado, saídas, avisos, prazo e Kanban); o que tem duas leituras continua erro',
        },
        {
          path: 'modules/ai-builder/blueprint/form-settings.spec.ts',
          tests: 5,
          covers:
            'Opções do processo no form da LOPS IA (settingsJson da versão): refazer um processo exportado mantém identificação obrigatória, bloco de identificação escondido e aprovação da resposta, e o DTO aceita; opção no padrão não sai na exportação e o recriado continua no padrão; processo antigo sem as chaves sai e volta igual; processo novo leva só o que a IA mandou; valor que não é sim/não é erro com o caminho — antes o construtor gravava só o modo e apagava as três',
        },
        {
          path: 'modules/kanban-phases/phase-people.spec.ts',
          tests: 6,
          covers:
            'Quem atua/aprova numa fase: ninguém escolhido vira null; formato novo ou perfil único das fases antigas; basta casar perfil ou usuário; ordem de quem aprova, regra da fase virando o modo da aprovação e o que os fluxos recebem da fase',
        },
        {
          path: 'modules/kanban-phases/phase-visibility.spec.ts',
          tests: 5,
          covers:
            '"Visível para" de uma fase: sem ninguém escolhido vira null (todos veem), sem repetição; basta casar perfil, área ou usuário; quem gerencia fases vê todas',
        },
        {
          path: 'modules/kanban-phases/card-display.spec.ts',
          tests: 17,
          covers:
            '"Personalizar card": indicador desconhecido/repetido descartado, campos com código válido sem repetir até o limite, rótulo aparado ou null, card "vazio" é escolha válida; ajuste da pessoa > padrão da fase > padrão do sistema; resposta formatada para o card (rótulo da opção, Sim/Não, R$, número e horas no formato brasileiro, data dd/mm/aaaa, Lista do ERP pelo nome, tabelas como quantidade de itens, texto longo cortado; arquivo, layout e objeto sem rótulo nunca aparecem)',
        },
        {
          path: 'modules/kanban-phases/card-display.service.spec.ts',
          tests: 6,
          covers:
            '"Personalizar card" (serviço): campos do formulário e depois das fases, sem arquivo, formulário ganha no código repetido; fase de outro processo = 404; ajuste pessoal grava por pessoa e fase e null apaga; padrão da fase grava normalizado e null volta ao do sistema; valores do card com precedência formulário > fluxo > fase, na ordem e com o rótulo escolhidos, campo que saiu do processo some; sem campo escolhido não consulta o banco',
        },
        {
          path: 'modules/kanban-phases/phase-card-visibility.spec.ts',
          tests: 8,
          covers:
            'Filtro de cards da fase pela resposta: só regras completas são gravadas (sem nenhuma vira null), sem repetição; lista múltipla, caixa (true/false), número e Lista do ERP viram textos comparáveis; quem está numa regra só vê o que casa (sem diferença de maiúsculas; basta uma das regras); quem não está segue "vê todos/nenhum"; quem configura as fases vê tudo',
        },
        {
          path: 'modules/kanban-phases/default-kanban-phases.spec.ts',
          tests: 16,
          covers:
            'Fases padrão (Novo, Pendente, Concluído como fase final) criadas com o formulário; duplicar copia as fases e os campos do original; status → coluna padrão',
        },
        {
          path: 'modules/item-lists/linked-options.spec.ts',
          tests: 4,
          covers:
            'Campo de seleção ligado a uma lista de itens: itens ativos viram as opções na ordem da lista (valor = id do item), renomear atualiza o rótulo, item inativo/apagado/opção digitada antes fica escondido com o último nome, reativar volta a aparecer, e a configuração (lista, escondidas, o que quem preenche vê)',
        },
        {
          path: 'modules/item-lists/item-lists.service.spec.ts',
          tests: 7,
          covers:
            'Listas de itens: cria com os itens na ordem, mantém o id dos que ficam e apaga os que saíram, recusa nome (sem diferenciar maiúscula) ou código repetido, salvar atualiza as opções dos campos ligados em formulários e fases (novo entra, inativo fica escondido) e campo de fase com lista que não existe é recusado; colunas próprias guardadas com os valores de cada item conferidos contra elas, e salvar sem colunas mantém as que já existem',
        },
        {
          path: 'modules/item-lists/item-list-columns.spec.ts',
          tests: 9,
          covers:
            'Colunas próprias das listas de itens: nomes aparados, opções só na coluna de seleção, nome repetido (inclusive com as colunas fixas) e opção repetida recusados; cada valor guardado no tipo da coluna, descartando vazios e colunas que não existem',
        },
        {
          path: 'modules/item-lists/item-order.settings.spec.ts',
          tests: 6,
          covers:
            'Campo "Pedido de itens": o formulário público recebe só itens ativos e as colunas escolhidas com o nome atual (seleção vira o nome da opção), sem o id da lista; retrato montado com os valores da lista, subtotal depois da quantidade e total; item inativo, inexistente ou repetido e quantidade abaixo do mínimo recusados; o que impede publicar (sem lista, lista apagada, sem coluna para preencher, total incompleto) e o formato do envio',
        },
        {
          path: 'modules/kanban-phases/phase-calculations.spec.ts',
          tests: 11,
          covers: 'Cálculo de fase e "Valor do card": "Valor (R$)" grava texto e número, precedência formulário > fluxo > fase, recálculo ignorando o valor velho, fórmula conferida com formato fixo em R$ e código de campo válido; "Total de horas" de fase grava em horas (sem prefixo, sufixo nem casas) e com todas as casas, para horas × valor fechar no centavo',
        },
        {
          path: 'modules/kanban-phases/phase-sla.spec.ts',
          tests: 6,
          covers: 'Prazo da fase: horas úteis (seg–sex, 8h–18h Brasília) pulando noite e fim de semana, vencimento corrido x útil, estado no prazo/alerta/vencido e fase final sem prazo',
        },
        {
          path: 'modules/kanban-phases/phase-required-fields.spec.ts',
          tests: 8,
          covers: 'Campos obrigatórios da fase, regras puras: vazio = sem valor, texto só com espaços, checkbox desmarcado, lista vazia e "Pedido de itens" sem item (número zero e arquivo contam); título/descrição/divisor e cálculo nunca são cobrados; mensagem de saída nomeia a fase e cada campo, no singular ou no plural, e junta a falta de responsável numa frase só (nada faltando = sem mensagem)',
        },
        {
          path: 'modules/kanban-phases/phase-move-back.spec.ts',
          tests: 6,
          covers: '"Ponto sem volta" da fase, regra pura: avançar nunca é segurado; voltar para antes da fase marcada é segurado, inclusive saindo dela; voltar até ela pode; cruzando duas vale a mais à frente; sem marca é livre; a mensagem nomeia a fase',
        },
        {
          path: 'modules/kanban-phases/phase-approval-automation.spec.ts',
          tests: 5,
          covers: 'Aprovação de fase sem fluxo, regras puras: fase vizinha pela ordem (próxima/anterior), 1ª fase, e quantos arquivos obrigatórios do formulário de abertura precisam chegar (opcional, com regra de exibição ou de seção não visitada não conta; seção só de arquivos conta)',
        },
        {
          path: 'modules/solicitations/phase-approval-automation.listener.spec.ts',
          tests: 8,
          covers: 'A fase pede a própria aprovação: 1ª fase "formulário completo" espera a foto obrigatória (e conta a que chegou antes do card nascer), "ao entrar" pede na criação, "pelo botão" nunca pede sozinho, outras fases pedem quando salvam o formulário da fase; a decisão vai para a regra da fase; aprovada e parada pela trava de saída, salvar os campos da fase ou definir o responsável tenta seguir; falha não sobe para quem emitiu o evento',
        },
        {
          path: 'modules/solicitations/solicitations.service.spec.ts',
          tests: 129,
          covers:
            'Criação a partir de submissão e de fluxo, atualizações, o kanban (sempre por fase; formulário sem fases recebe as padrão; "Sem formulário" em Novo/Pendente/Concluído pelo status; o board traz o nome do processo mesmo sem nenhum card), movePhase, moveStage e as respostas às perguntas padrão de cada solicitação; e a emissão de solicitations.phase_fields_saved ao salvar campos de fase (a automação fica a cargo de um Flow — ver flows-phase-fields.listener.spec.ts); campos obrigatórios da fase recusados sem valor (checkbox desmarcado, texto só com espaços; vale o que já estava salvo; título/descrição/divisor nunca cobrados); "Visível para" das fases no board (só fases abertas para quem não casa; perfil, área ou usuário bastam; quem gerencia fases vê todas com as restritas marcadas) e no resumo do Kanban (cards de fase escondida não contam); filtro de cards da fase pela resposta (quem está numa regra por perfil ou nome só vê os cards com aquela resposta, vinda do formulário ou de campo de fase, sem diferença de maiúsculas; quem não está em regra vê todos ou nenhum conforme a fase; quem configura as fases vê tudo com a quantidade de regras na coluna e sem buscar respostas; o resumo conta só o que o filtro deixa ver; o card que a pessoa abriu ou do qual é responsável aparece mesmo fora da regra; o card escondido não abre por link nem gera aviso em tempo real, e a lista de Solicitações o deixa de fora); quem atua na fase por perfil OU usuário (fase antiga com perfil único segue valendo) e pedido de aprovação com perfis e usuários juntos; "Valor (R$)" de fase grava o número junto do texto e o cálculo sai do servidor (resultado em branco apaga o velho); board soma o "Valor do card" por coluna com o formulário ganhando do campo de fase, e sem ele não traz valor nem total; card em fase com prazo traz o prazo da fase (prorrogação no lugar do configurado); "Personalizar card" no board (cada coluna traz o que vale para a pessoa — ajuste dela, padrão da fase ou do sistema — e os cards trazem os campos escolhidos; quem respondeu pelo link público aparece como solicitante pelo nome do envio); pedir aprovação segue a regra da fase (em ordem, na ordem escolhida); aprovação de fase sem fluxo: aprovada vai sozinha para a próxima fase, reprovada volta para a anterior ou encerra a solicitação de qualquer status, card que já saiu da fase não é mexido, pedido automático sem pessoa e sem repetir pendente/aprovada (reprovada pede de novo); "só avançar com os obrigatórios preenchidos": movePhase segura o card e nomeia cada campo vazio, vale também para fluxo/aprovação automática, voltar é livre, opção desligada não muda nada e campo fora do caminho do formulário da fase não é cobrado; "só avançar com responsável" na mesma checagem: sem ninguém atribuído não avança (nem pelo processo), com responsável avança, voltar é livre e com as duas travas a mensagem lista o responsável e os campos; "ponto sem volta": quem só atua não devolve o card para antes da fase marcada (nem saindo dela) e nada é gravado, voltar até ela pode, quem configura as fases devolve, o processo (fluxo, reprovação que devolve) passa, avançar não muda e desligada volta como antes',
        },
        {
          path: 'modules/solicitations/score-entry.spec.ts',
          tests: 4,
          covers:
            'Em que fase o card de um envio nasce pelas faixas dos campos calculados: vale o primeiro cálculo (na ordem do formulário) cujo resultado cai numa faixa com fase',
        },
        {
          path: 'modules/flows/score-alert/score-alert.spec.ts',
          tests: 19,
          covers:
            'Aviso de pontuação no envio: seções abaixo do limite (próprio da seção ou o marco), resultado abaixo do mínimo, envio de sempre (com tudo em dia vira "dentro do esperado"), a unidade auditada no assunto pelo rótulo da opção, assunto próprio com {unidade}/{formulario}, uma mensagem por canal e destinatários, texto com seções e link direto, e o listener idempotente que nunca derruba a criação do card; arte de fundo do e-mail — a do formulário, senão a geral da Administração, senão a padrão, ignorando imagem que não existe mais',
        },
        {
          path: 'modules/flows/score-alert/score-alert-email.spec.ts',
          tests: 10,
          covers:
            'E-mail formatado do aviso de pontuação: tabela com todas as seções com nota e o limite de cada uma, linha abaixo do limite em vermelho, resultados, botão "Ver a resposta" só com link http(s), tudo que vem de dados escapado, a identidade visual que o Gmail mantém (arte de fundo e marca do Tijuca Flow embutidas por cid, registradas para o canal anexar, cores por bgcolor/background-color) o texto de prévia da caixa de entrada (unidade ou quem respondeu, seções abaixo, resultado com o mínimo), a unidade em destaque no topo e a versão "dentro do esperado" em verde',
        },
        {
          path: 'modules/solicitations/phase-sla.service.spec.ts',
          tests: 10,
          covers: 'SLA por fase: linha do tempo (encerradas no/fora do prazo, atual com o estado de agora, card nunca movido), prorrogação com histórico, verificação periódica que avisa quem atua sem repetir, e registro da mudança de fase',
        },
        {
          path: 'modules/solicitations/solicitation-comments.service.spec.ts',
          tests: 26,
          covers:
            'Comentário público por token e comentário interno com permissão; e a proposta de resposta — vira `pending` quando o formulário exige aprovação, bloqueia 2ª proposta simultânea, e a decisão do solicitante (aprova para `completed` ou reprova exigindo motivo, sem mexer no status)',
        },
        {
          path: 'modules/standard-questions/standard-questions.service.spec.ts',
          tests: 6,
          covers:
            'Listagem ordenada e substituição (criar, apagar removidas, upsert, opções só quando enviadas) das perguntas padrão de um formulário',
        },
        {
          path: 'modules/attachments/attachments.service.spec.ts',
          tests: 38,
          covers:
            'Upload, download e exclusão de anexo, com dono e permissão; validação de etiqueta com IA para upload vinculado a uma fase já existente; e a emissão do evento attachments.uploaded para upload vinculado a uma submissão (a automação de IA + aprovação fica a cargo de um Flow — ver flows-attachment.listener.spec.ts); nome escolhido no envio (mantém a extensão, sem barras/caminho, corta em 200), descrição (aparada, até 1000) e renomear/descrever depois (quem enviou ou "anexos de todos")',
        },
        {
          path: 'modules/solicitations/solicitations.controller.spec.ts',
          tests: 7,
          covers: 'Contrato das rotas autenticadas de solicitação, incluindo GET /solicitations/:id/erp-details (confere o acesso antes de consultar o ERP)',
        },
        {
          path: 'modules/solicitations/public-solicitations.controller.spec.ts',
          tests: 6,
          covers: 'Acompanhamento público por token de rastreamento',
        },
        {
          path: 'modules/attachments/attachments.controller.spec.ts',
          tests: 19,
          covers:
            'Rotas de anexo, autenticadas e públicas; download com arquivo ausente no disco responde 404 limpo (em vez de pendurar a requisição até o proxy devolver 502) e, se o erro vier depois de já ter começado a enviar, derruba a conexão sem tentar JSON; a lista do card mostra todos os anexos a quem foi chamado a aprovar; nome e descrição do multipart repassados (autenticado e público) e PATCH /attachments/:id conferindo o processo',
        },
        {
          path: 'modules/solicitations/sla-admin.controller.spec.ts',
          tests: 1,
          covers: 'Rota administrativa de configuração de SLA',
        },
      ],
    },
    {
      id: 'automacao',
      label: 'Fluxos e automações',
      focus: 'O motor que executa nós, os gatilhos que o disparam e o agendamento.',
      files: [
        {
          path: 'modules/integrations/lops-ai/lops-ai.service.spec.ts',
          tests: 13,
          covers:
            'Integração LOPS IA: resolução de URL e timeout a partir de LOPS_AI_* (com precedência dos valores do nó, sem nenhuma chave) e conexão de listagem com a chave do servidor, que só serve para listar; listagem de agentes em GET /models com X-API-Key — ordena por nome, descarta entradas malformadas, e vira 503 com o motivo quando falta configuração, a chave é recusada (sem vazá-la), a LOPS IA falha ou devolve corpo inválido',
        },
        {
          path: 'modules/integrations/lops-ai/lops-ai.controller.spec.ts',
          tests: 2,
          covers: 'GET /integrations/lops-ai/agents devolve { agents } do serviço e propaga o erro (ex.: 503 com o motivo)',
        },
        {
          path: 'modules/flows/flow-execution.engine.spec.ts',
          tests: 164,
          covers:
            'Execução dos nós: criar solicitação, sub-fluxo, verificação HTTP e condição sobre resposta; a pausa em action_create_approval até a decisão (status waiting_approval, retomada via resumeFrom) — sem isso os nós seguintes executavam antes de qualquer decisão humana; o nó "LOPS IA" (action_ai_agent: chamada multipart a um agente da LOPS IA, gravação da resposta e do anexo; a URL vem do servidor — LOPS_AI_BASE_URL, salvo baseUrl próprio do nó — e a chave usada é SEMPRE a do nó: sem chave no nó o agente nem é chamado, a LOPS_AI_API_KEY do servidor nunca executa um agente; falta de URL falha com mensagem clara e o slug é codificado na URL); action_create_approval com scope: "phase" — cria aprovação escopada à fase atual sem nunca mudar solicitation.status; condition_approval_result — ramifica pelo resultado (approved/rejected) da aprovação criada logo antes no mesmo caminho; action_wait_for_phase_fields — uma segunda forma de pausa (waitingPhaseId), que permite unir num único fluxo etapas separadas por ações manuais no meio; e action_move_phase — fecha o ciclo chamando movePhase, reaproveitando a mesma trava de aprovação que um humano usaria pela UI; aprovadores externos em action_create_approval (approverEmails na lista fixa, sozinhos ou com usuários; allowExternalApprovers nos modos campo/dinâmico faz e-mail sem usuário virar aprovador externo em vez de falhar, e sem a opção o comportamento antigo — falha — continua); "Mover para fase" leva o fluxo para a fase de destino (aprovação de fase seguinte vai para quem aprova ela); "Avisar quem aprova por e-mail" do Criar aprovação (e-mail em segundo plano para quem decide agora, texto padrão, desligado não envia, falha no aviso não derruba o nó); regra da aprovação: no modo da fase vale a da fase, nos outros a do nó (o "Modo sequencial" antigo passa a valer)',
        },
        {
          path: 'modules/flows/flows.service.spec.ts',
          tests: 108,
          covers:
            'Escopo de permissão em `findAll`, `findByForm` e `findOne`; campos de fase do Kanban salvos na solicitação entram em ctx.fields (a resposta do formulário ganha no mesmo código; sem solicitação não consulta); `resumePausedExecution`/`resumePausedPhaseFieldsExecution` — retoma a partir do nó pausado certo (aprovação ou espera de fase), mescla os resultados e repausa em qualquer um dos dois tipos se outro nó de espera for encontrado no caminho; e a validação de dados do gatilho trigger_attachment_uploaded, dos nós action_ai_agent (exige o agente escolhido e a chave do nó, mas não a URL; aceita nós antigos com baseUrl), action_wait_for_phase_fields e action_move_phase, do gatilho trigger_phase_field_saved e da condição condition_approval_result; e de action_create_approval com aprovadores por e-mail (approverEmails válido/inválido/acima de 10, vazio sem usuário continua recusado, allowExternalApprovers só booleano); validação do "Avisar quem aprova por e-mail" (enabled booleano, tamanho do assunto, variável mal formada)',
        },
        {
          path: 'modules/flows/lib/compute-next-run.spec.ts',
          tests: 11,
          covers: '`computeNextRunAt` — próxima execução de um fluxo agendado',
        },
        {
          path: 'modules/flows/flows-sla.listener.spec.ts',
          tests: 7,
          covers: 'Disparo de fluxo por evento de SLA; prazo da fase busca gatilhos "prazo da fase" e leva a fase na metadata',
        },
        {
          path: 'modules/flows/flows-multiple-entries.spec.ts',
          tests: 18,
          covers: 'Fluxo com várias entradas: quais gatilhos ativos casam com o evento, execução pela entrada certa e escolha da entrada no teste; gatilho de SLA distingue o prazo geral do prazo da fase (e a fase filtrada)',
        },
        {
          path: 'modules/flows/flows-scheduled-trigger.service.spec.ts',
          tests: 5,
          covers: '`pollDueFlows` — varredura dos fluxos vencidos',
        },
        {
          path: 'modules/automations/automations.service.spec.ts',
          tests: 5,
          covers: 'Regras de automação disparadas ao alcançar uma seção',
        },
        {
          path: 'modules/flows/flows-approval.listener.spec.ts',
          tests: 6,
          covers:
            'Disparo de fluxo por decisão de aprovação; e retomada de toda execução parada esperando essa aprovação (`FlowResumeJob`, com fallback inline se a fila estiver indisponível)',
        },
        {
          path: 'modules/flows/flows-solicitation.listener.spec.ts',
          tests: 3,
          covers: 'Disparo de fluxo por evento de solicitação',
        },
        {
          path: 'modules/flows/flows-attachment.listener.spec.ts',
          tests: 6,
          covers:
            'Disparo de fluxo por upload de anexo de imagem em uma submissão; resolução da fase efetiva e vínculo do anexo à solicitação/fase antes de despachar',
        },
        {
          path: 'modules/flows/flows-phase-fields.listener.spec.ts',
          tests: 10,
          covers:
            'Disparo de fluxo por campos de fase salvos (SolicitationsService.savePhaseFieldValues); o filtro por fase do gatilho — ao contrário do anexo de submissão, a fase é conhecida com certeza no momento do evento, então o filtro é aplicado de verdade; e a retomada de execuções pausadas em action_wait_for_phase_fields esperando esta fase, independente de haver algum fluxo com trigger_phase_field_saved como próprio gatilho',
        },
        {
          path: 'modules/flows/flows-phase-entered.listener.spec.ts',
          tests: 9,
          covers:
            '"Entrou na fase": card que nasce na 1ª fase (formulário enviado ou criação manual) dispara os fluxos dela, como o mapa do processo mostra; quem já nasce noutra fase (faixa de pontuação) vem por phase_changed e a entrada externa (webhook) fica de fora; sem RabbitMQ roda na hora com os campos do formulário; mudança de fase filtra destino e origem e para no limite de encadeamento',
        },
        {
          path: 'modules/flows/flows-webhook.listener.spec.ts',
          tests: 8,
          covers: 'Disparo de fluxo por webhook de entrada',
        },
        {
          path: 'modules/flows/flow.types.spec.ts',
          tests: 2,
          covers: 'Formato dos gatilhos de SLA',
        },
        {
          path: 'modules/flows/lib/flow-field-values.spec.ts',
          tests: 7,
          covers:
            'Valores dos campos que o fluxo enxerga: precedência texto/número/booleano/json e, na "Lista do ERP", {{campo}} = nome e {{campo_codigo}} = código, sem sobrescrever um campo de verdade com esse nome; valores dos campos de fase do Kanban pela mesma precedência',
        },
        {
          path: 'modules/flows/lib/flow-field-labels.spec.ts',
          tests: 6,
          covers:
            'Seleção nos textos do fluxo: {{campo}} sai com o rótulo da opção e {{campo_valor}} com o valor interno (múltipla escolha junta os rótulos; opção apagada fica sem rótulo); campo de verdade chamado <campo>_valor ganha; o nó de Notificação recebe as duas variáveis',
        },
      ],
    },
    {
      id: 'notificacoes',
      label: 'Notificações (nó do fluxo e caixa de saída)',
      focus:
        'O módulo de notificações: contrato de canal, estados, retentativa, renderização segura de modelos, destinatários, idempotência e o nó action_notification dentro do motor.',
      files: [
        {
          path: 'modules/notifications/domain/notification-state.spec.ts',
          tests: 33,
          covers:
            'Máquina de estados do destinatário (todas as 49 combinações: só as transições declaradas são permitidas; processing → cancelled nunca) e o estado agregado da notificação (sent / partially_sent / failed / cancelled / scheduled…)',
        },
        {
          path: 'modules/notifications/domain/notification-retry.spec.ts',
          tests: 16,
          covers:
            'Política de retentativa: limites de tentativas e intervalo, só falhas transitórias são repetidas, backoff exponencial com jitter de ±20 %, Retry-After do provedor e teto de 1 hora',
        },
        {
          path: 'modules/notifications/domain/notification-errors.spec.ts',
          tests: 25,
          covers:
            'Classificação de erros de provedor (HTTP 429/5xx/4xx, axios sem resposta, nodemailer EAUTH/EENVELOPE/códigos SMTP, timeout) em transitório × permanente; sanitização de mensagens (e-mail, telefone, URL, segredos, tokens) e máscara de endereço',
        },
        {
          path: 'modules/notifications/domain/notification-template.spec.ts',
          tests: 26,
          covers:
            'Renderização de modelos {{variável}} em texto puro: passada única (um valor com {{x}} não é reexpandido), sem acesso ao protótipo, sem execução de código, variável ausente vira vazio e é reportada, remoção de caracteres de controle/direção, truncamento, escape de HTML e anti header-injection',
        },
        {
          path: 'modules/notifications/channels/address.util.spec.ts',
          tests: 38,
          covers:
            'Normalização e validação de e-mail e de telefone (DDI 55 por padrão) e destinatário de WhatsApp: grupo pelo JID (`...@g.us`, formato novo e antigo) ou telefone',
        },
        {
          path: 'modules/notifications/email-images/email-images.service.spec.ts',
          tests: 5,
          covers:
            'Imagens dos e-mails (arte trocada na tela): só JPEG/PNG de verdade (tipo pelos bytes, não pelo navegador) e até 3 MB, bytes no banco fora das consultas comuns, id que não é uuid nem consulta, e a arte geral lida da configuração',
        },
        {
          path: 'modules/notifications/channels/email.channel.spec.ts',
          tests: 29,
          covers:
            'Contrato do canal e-mail: payload enviado (texto + HTML escapado ou o HTML pronto do sistema, imagens embutidas que esse HTML referencia por cid — as do sistema presentes no disco e as enviadas pela tela que ainda existem no banco —, assunto sem quebra de linha, Message-ID estável), resultado, classificação dos erros SMTP, e o comportamento sem SMTP — simulado fora de produção, falha not_configured em produção',
        },
        {
          path: 'modules/notifications/channels/whatsapp.channel.spec.ts',
          tests: 32,
          covers:
            'Contrato do canal WhatsApp: telefone normalizado, grupo pelo JID enviado sem alteração, título em negrito, sent/queued/failed, classificação de HTTP (429 com Retry-After, 5xx, 4xx, 401/403, timeout, rede) e provedor mock aceito só fora de produção',
        },
        {
          path: 'modules/notifications/channels/in-app.channel.spec.ts',
          tests: 9,
          covers:
            'Contrato do canal in_app: grava na caixa de entrada do usuário (entregue), respeita os limites das colunas e recusa usuário inexistente/inativo',
        },
        {
          path: 'modules/notifications/notifications.service.spec.ts',
          tests: 33,
          covers:
            'Caixa de saída: validação de entrada, persistência com correlação e política normalizada, agendamento, deduplicação de destinatários, destinatário inválido gravado como failed (nunca some), idempotência (inclusive a corrida de UNIQUE), limite de envio por fluxo/hora, resumo, cancelar, reenviar e expurgo por retenção',
        },
        {
          path: 'modules/notifications/notification-dispatcher.service.spec.ts',
          tests: 39,
          covers:
            'Despacho: reivindicação com SKIP LOCKED, tentativa registrada antes do envio, sucesso, falha transitória × permanente, backoff, tentativas esgotadas, timeout, erro sanitizado, resultado atrasado ignorado, concorrência limitada, estado agregado e recuperação de destinatários travados',
        },
        {
          path: 'modules/notifications/notification-worker.service.spec.ts',
          tests: 7,
          covers:
            'Worker periódico: lotes, teto por ciclo, sem sobreposição de ciclos, desligamento por variável de ambiente e resiliência a erros',
        },
        {
          path: 'modules/notifications/user-notice.service.spec.ts',
          tests: 5,
          covers:
            'Aviso do sistema a usuários internos: vai para o sino (in_app, com link para a tela) e para o app; sem repetidos nem quem fez a ação; mesma chave não repete o aviso; lotes de 50; falha no sino não impede o push nem derruba a ação',
        },
        {
          path: 'modules/notifications/notification-inbox.service.spec.ts',
          tests: 7,
          covers:
            'Caixa de entrada do usuário: sempre filtrada pelo usuário autenticado; marcar como lida só atinge as próprias',
        },
        {
          path: 'modules/flows/notification/notification-node.validation.spec.ts',
          tests: 44,
          covers:
            'Validação estática do nó action_notification: canal, conteúdo, variáveis mal formadas, destinatários por tipo (WhatsApp fixo aceita telefone ou grupo), limite de destinatários, atraso, política de retentativa e chave de idempotência',
        },
        {
          path: 'modules/flows/notification/notification-recipient.resolver.spec.ts',
          tests: 19,
          covers:
            'Resolução de destinatários a partir do contexto do fluxo (usuários, solicitante, responsável, fixo, campo, payload) por canal; o que não resolve vira falha rastreável e nunca vaza endereço',
        },
        {
          path: 'modules/flows/notification/flow-notification-node.executor.spec.ts',
          tests: 31,
          covers:
            'Executor do nó: renderização, correlação com fluxo/execução/nó, política de falha (permanente falha o nó, transitória segue), background e atraso, idempotência (por execução, por template, sem chave), dry-run do teste manual e prévia do editor',
        },
        {
          path: 'modules/flows/notification/notification.presenter.spec.ts',
          tests: 8,
          covers:
            'Projeção de leitura da API: quem só vê (flows.view) recebe estados com endereço mascarado e sem conteúdo; quem gerencia vê tudo',
        },
        {
          path: 'modules/flows/lib/flow-template-variables.spec.ts',
          tests: 14,
          covers:
            'Variáveis disponíveis ao nó de notificação: embutidas, campos do formulário, metadata e payload do webhook (profundidade e quantidade limitadas), precedência e proteção contra poluição de protótipo; {{approval_title}} e {{approval_description}}',
        },
        {
          path: 'modules/flows/flow-execution.engine.notification.spec.ts',
          tests: 13,
          covers:
            'O nó action_notification dentro do motor: despacho ao executor, falha encerra o ramo (irmãos continuam), output preservado em nó failed, continueOnFailure (e que NÃO vale para nós antigos), e que o contexto de teste manual chega ao executor',
        },
        {
          path: 'modules/flows/flows.service.notification.spec.ts',
          tests: 19,
          covers:
            'Onde a validação do nó é aplicada: criar, atualizar e ativar (revalida só nós de notificação, sem barrar fluxos antigos); e o controle de acesso aos endpoints de notificações do fluxo',
        },
      ],
    },
    {
      id: 'integracoes',
      label: 'Integrações externas',
      focus: 'ERP, WhatsApp, webhooks e Google Workspace — sempre com o serviço externo mockado.',
      files: [
        {
          path: 'modules/integrations/erp/erp-connector.service.spec.ts',
          tests: 70,
          covers: 'Conector Protheus: autenticação, envio, alçada, reprocessamento e tratamento de erro',
        },
        {
          path: 'modules/integrations/erp/erp-token-refresh.service.spec.ts',
          tests: 25,
          covers: 'Renovação do token do ERP e o que acontece quando ela falha',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-lookup.service.spec.ts',
          tests: 21,
          covers:
            'Cliente da API erp-lookup ("Lista do ERP"): token do conector, timeout de 5s, cache da lista curta e da conferência, item inexistente x lista inexistente, ERP fora/token recusado/rede/URL externa viram "indisponível"; ficha do item conferida (só o formato esperado passa), item inexistente/lista sem ficha/API antiga viram "sem ficha"',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-lookup-field.service.spec.ts',
          tests: 20,
          covers:
            'Pesquisa e ficha do item no formulário publicado (mínimo de caracteres, exigirLogin, 404, 503) e a conferência no envio: grava o nome do ERP, código inexistente vira erro no campo, ERP fora vira 503 ERP_INDISPONIVEL; "Dados do ERP" da solicitação: ficha de cada "Lista do ERP" respondida pelo campo da versão respondida, ignora outros tipos, ERP fora vira "indisponível" sem derrubar as outras',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-lookup.settings.spec.ts',
          tests: 7,
          covers:
            'Configuração do campo "Lista do ERP": padrões, limites do mínimo de caracteres e o que o formulário público deixa de receber (conector e lista)',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-table.settings.spec.ts',
          tests: 6,
          covers:
            'Configuração do campo "Tabela dinâmica do ERP": padrões e limites, o que impede publicar (coluna faltando, IDs repetidos ou fora do padrão, seleção sem opções, mínimo > máximo) e o que o formulário público deixa de receber (conector, lista, tabela, nome do parâmetro)',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-table.snapshot.spec.ts',
          tests: 19,
          covers:
            'Hash da tabela (só colunas exibidas, sensível a valor, linha e ordem), formato do envio, retrato montado só com dados do servidor, linhas faltando/inventadas/repetidas, validação por célula (número, casas, data, seleção, checkbox) e o resumo em texto cortado antes do limite do Google Sheets',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-table-field.service.spec.ts',
          tests: 14,
          covers:
            'Carregamento público da tabela (colunas configuradas, cache, 400/401/404/503, flag desligada), revalidação no envio sem cache com o código conferido (409 ERP_TABLE_CHANGED, adulteração ignorada, pedido sem itens, dependência ausente, app antigo, ERP fora) e conferências da publicação (ordem dos campos, conector, tabela, chave, parâmetros e colunas no erp-lookup; parâmetro sem campo associado diz uma vez só onde associar e que tipo de campo serve)',
        },
        {
          path: 'modules/integrations/erp/lookup/erp-lookup.log.spec.ts',
          tests: 3,
          covers: 'O log de requisição não grava o texto pesquisado na "Lista do ERP"',
        },
        {
          path: 'modules/google-workspace/sheets/google-sheets-headers.service.spec.ts',
          tests: 10,
          covers: 'Montagem da linha da planilha e serialização de cada tipo de valor',
        },
        {
          path: 'modules/google-workspace/oauth/google-oauth.service.spec.ts',
          tests: 5,
          covers:
            'Permissões pedidas ao Google (login e conexão): só drive.file — nunca o escopo amplo de todas as planilhas —, sem include_granted_scopes (não acumula escopos antigos), restrição ao domínio da empresa, acesso offline e consentimento forçado só sem refresh token',
        },
        {
          path: 'modules/google-workspace/connection/google-access-audit.service.spec.ts',
          tests: 15,
          covers:
            'Auditoria e limpeza em massa dos acessos Google: lê os escopos concedidos pela renovação do token, classifica acesso excedente (spreadsheets, drive…), dryRun não altera nada, apply desconecta e revoga só quem excede, trata token morto/ilegível, erro de rede sem desconectar ninguém e nunca devolve token',
        },
        {
          path: 'modules/google-workspace/oauth/google-state.helper.spec.ts',
          tests: 9,
          covers: 'Assinatura e validação do parâmetro `state` do OAuth',
        },
        {
          path: 'modules/google-workspace/connection/google-connection.service.spec.ts',
          tests: 11,
          covers: 'Situação da conta Google vinculada ao usuário',
        },
        {
          path: 'modules/integrations/outbound-webhook.service.spec.ts',
          tests: 6,
          covers: 'Webhook de saída: assinatura, tentativa e registro',
        },
        {
          path: 'modules/integrations/erp/erp-auth-failed.listener.spec.ts',
          tests: 5,
          covers: 'Reação a falha de autenticação do ERP',
        },
        {
          path: 'modules/integrations/inbound-webhook.service.spec.ts',
          tests: 11,
          covers: 'Webhook de entrada: validação de assinatura e roteamento',
        },
        {
          path: 'modules/integrations/inbound-list.parser.spec.ts',
          tests: 14,
          covers: 'Webhook de entrada: leitura da lista de itens do payload (lote)',
        },
        {
          path: 'modules/integrations/whatsapp/whatsapp-connector.service.spec.ts',
          tests: 8,
          covers:
            'Conector WhatsApp ligado à solicitação; lista de grupos para o editor (sem provedor não consulta, falha do provedor vira 502)',
        },
        {
          path: 'modules/integrations/whatsapp/evolution-api.provider.spec.ts',
          tests: 4,
          covers: 'Provedor Evolution API: envio e listagem de grupos (só JIDs de grupo, por nome)',
        },
        {
          path: 'modules/integrations/whatsapp/whatsapp-client.service.spec.ts',
          tests: 3,
          covers: 'Cliente que escolhe o provedor e trata provedor fora do ar',
        },
        {
          path: 'modules/integrations/whatsapp/mock-whatsapp.provider.spec.ts',
          tests: 2,
          covers: 'Provedor mock usado em desenvolvimento',
        },
      ],
    },
    {
      id: 'governanca',
      label: 'Governança e infraestrutura',
      focus: 'Autenticação, usuários, perfis, áreas, configurações, relatórios e armazenamento.',
      files: [
        {
          path: 'modules/users/users.service.spec.ts',
          tests: 24,
          covers: 'Criar, atualizar e desativar usuário, com unicidade e permissão',
        },
        {
          path: 'modules/auth/auth.service.spec.ts',
          tests: 26,
          covers:
            'Login local, login Google Workspace, cadastro de senha, conta inativa e aceite do convite (gasta o link, grava a senha, derruba sessões antigas e abre a nova)',
        },
        {
          path: 'modules/users/invite/user-invite.service.spec.ts',
          tests: 24,
          covers:
            'Convite por e-mail ao criar usuário: só o hash do token no banco, link /convite no e-mail, validade (7 dias ou USER_INVITE_TTL_HOURS), auditoria, endereço recusado e falha temporária com nova tentativa, sem SMTP (produção não gera token; desenvolvimento só loga), usuário inativo, consulta e gasto do convite numa operação só (inexistente/expirado/inativo/formato inválido → 404), formato do token e e-mail com nomes escapados',
        },
        {
          path: 'modules/roles/roles.service.spec.ts',
          tests: 22,
          covers:
            'CRUD de perfis e vínculo com permissões; salvar troca só os códigos de sistema e os enviados (as linhas antigas de processo ficam para desfazer o deploy) e dashboard.view_forms_stats saiu do catálogo',
        },
        {
          path: 'modules/settings/settings.service.spec.ts',
          tests: 16,
          covers: 'Leitura e escrita das configurações do sistema',
        },
        {
          path: 'modules/areas/areas.service.spec.ts',
          tests: 12,
          covers: 'CRUD de áreas e efeito na visibilidade',
        },
        {
          path: 'modules/dashboard/operational-dashboard.service.spec.ts',
          tests: 10,
          covers: 'Agregações do painel operacional',
        },
        {
          path: 'modules/solicitations/process-panel.spec.ts',
          tests: 6,
          covers: 'Resumo: o que é "para mim" e a contagem por processo e fase',
        },
        {
          path: 'modules/solicitations/process-handoff.answers.spec.ts',
          tests: 12,
          covers: 'Encaminhar para outro processo: respostas do destino a partir do card de origem — mesmo código sozinho, mapeamento vence, seleção pelo valor ou rótulo, múltipla escolha, cálculo refeito, obrigatório vazio avisado, arquivo como anexo e conversões de tipo',
        },
        {
          path: 'modules/realtime/realtime.service.spec.ts',
          tests: 5,
          covers: 'Tempo real: rajadas viram um aviso, solicitação nova só para quem a vê',
        },
        {
          path: 'modules/auth/refresh-token.service.spec.ts',
          tests: 12,
          covers:
            'Emissão e rotação do refresh token, incluindo token desconhecido; duas renovações quase juntas (duas abas, reload no meio) dentro de 30 s não derrubam as sessões, mas fora da janela ou depois de logout continua sendo tratado como roubo',
        },
        {
          path: 'modules/audit/audit.service.spec.ts',
          tests: 2,
          covers:
            'Auditoria traz o nome de quem fez (uma consulta por página); evento do sistema ou de usuário apagado fica sem nome',
        },
        {
          path: 'modules/access/process-access.service.spec.ts',
          tests: 20,
          covers:
            'Ponto único do acesso por processo: escopo de cada código no vínculo (todas × só as minhas), apelidos dos códigos antigos, vínculo sem caixinha ainda vê o processo, acesso total, regra do card (próprio pedido sem vínculo, agir pede também ver, card sem processo), filtros de lista em SQL, sessão do front (sistema do perfil + maior escopo entre vínculos), cache invalidável e gravação do vínculo',
        },
        {
          path: 'modules/access/card-filter.service.spec.ts',
          tests: 6,
          covers:
            'Filtro de cards da fase como regra de acesso: esconde o card cuja resposta não casa com a regra da pessoa (sem resposta não casa); não esconde em fase sem filtro, card sem processo, o próprio card (aberto ou sob responsabilidade) nem de quem configura as fases (sem consultar fases); card sem fase ou com fase apagada vale a primeira; listas recebem os escondidos com a resposta de origem e nem buscam cards quando nada pode ser escondido; quem vê as respostas do processo não abre a de um card escondido, mas o aprovador dele abre',
        },
        {
          path: 'modules/access/access-conversion.spec.ts',
          tests: 7,
          covers:
            'Conversão do acesso antigo em vínculos (migration): perfil com tudo vira acesso total, criador vira membro completo, gestor só nos processos da área, exceção do gestor sem área, editor no atribuído, leitor só nos publicados vendo os próprios cards, ninguém além do criador gerencia acesso',
        },
        {
          path: 'modules/access/process-members.service.spec.ts',
          tests: 12,
          covers:
            'Cadastro de vínculos: só quem gerencia o acesso ao processo (ou tem acesso total) mexe, catálogo valida códigos e escopos, auditoria grant/update/revoke com o antes, processos de uma pessoa vistos por quem cadastra',
        },
        {
          path: 'modules/approvals/approvals.controller.spec.ts',
          tests: 4,
          covers:
            'Rotas de aprovação conferem o processo do card: criar, cancelar e reenviar link pedem "pedir e cancelar aprovações" nele antes de chamar o serviço; "ver todas" vem do processo do card',
        },
        {
          path: 'modules/roles/permissions.service.spec.ts',
          tests: 7,
          covers: 'Resolução de escopo por perfil e invalidação do cache',
        },
        {
          path: 'modules/reports/executive-report.service.spec.ts',
          tests: 7,
          covers: 'Relatório executivo de solicitações e sua rota',
        },
        {
          path: 'modules/storage/storage.service.spec.ts',
          tests: 3,
          covers: '`validateFile` — tipo e tamanho aceitos no upload',
        },
        {
          path: 'database/seed/demo-seed.service.spec.ts',
          tests: 2,
          covers: 'Semente de demonstração roda sem quebrar e é idempotente',
        },
        {
          path: 'modules/health/health.controller.spec.ts',
          tests: 2,
          covers:
            'AdminSeedIndicator (alimenta GET /health/ready): fica saudável só quando o e-mail do admin semente bate com o que UsersService.ensureSeedAdmin() de fato cria',
        },
        {
          path: 'modules/health/service-map/service-map.probe.spec.ts',
          tests: 4,
          covers:
            'Sonda de rede do Mapa de serviços: resolve o nome pelo DNS assíncrono antes da chamada, para container parado falhar em até 1 s sem ocupar o pool de threads do Node',
        },
        {
          path: 'modules/health/service-map/service-map.service.spec.ts',
          tests: 18,
          covers:
            'Mapa de serviços (GET /admin/service-map/status): tudo no ar, endereços padrão da rede do compose, variável vazia tratada como ausente, timeout de 2,5 s, container parado ou conexão derrubada, backend nunca fora do ar (disco lento não conta), perfis opcionais "sob demanda", fila do RabbitMQ acima do limite, alvo postgres down no Prometheus, erp-lookup lento, sem resposta ou sem banco, RabbitMQ sem reaproveitar o localhost do .env e cache de 10 s',
        },
      ],
    },
  ],
};

export const FRONTEND_SUITE: TestSuite = {
  id: 'frontend',
  label: 'Frontend',
  runner: 'Vitest + Testing Library (jsdom)',
  command: 'npm --prefix frontend test',
  pattern: 'frontend/src/**/*.test.ts(x)',
  groups: [
    {
      id: 'regras-cliente',
      label: 'Regras de negócio no cliente',
      focus: 'Lógica pura que precisa concordar com o backend — validação de fluxo, SLA e formatação do kanban.',
      files: [
        {
          path: 'modules/flows/lib/__tests__/flow-validation.test.ts',
          tests: 81,
          covers: 'Validação do desenho do fluxo: canvas vazio, sem gatilho, nó não configurado, ciclo e ramo solto; inclui o gatilho "Anexo enviado", o nó "LOPS IA" (exige o agente escolhido e a chave de API; a URL vem do servidor), o gatilho "Campos de fase salvos", a condição "Resultado da aprovação", o nó "Aguardar campos de fase" e o nó "Mover para fase"; e a aprovação com aprovadores por e-mail (só e-mails basta, e-mail inválido e mais de 10 são apontados, lista vazia não conta)',
        },
        {
          path: 'modules/flows/lib/__tests__/flow-entries.test.ts',
          tests: 10,
          covers: 'Várias entradas no mesmo fluxo no editor e o formulário de cada nó (resolveNodeFormId)',
        },
        {
          path: 'modules/flows/lib/__tests__/forward-mapping.test.ts',
          tests: 3,
          covers: 'Painel do "Encaminhar para outro processo": campos do destino e da origem, compatibilidade de tipos e o que vai sozinho pelo mesmo código',
        },
        {
          path: 'lib/email-list.test.ts',
          tests: 13,
          covers: 'Lista de e-mails digitada à mão (aprovadores externos): separadores vírgula/ponto e vírgula/espaço/linha, minúsculas, sem repetidos, trechos inválidos separados e o mesmo critério de formato/tamanho do backend',
        },
        {
          path: 'lib/attachment-upload.test.ts',
          tests: 14,
          covers: 'Anexos: nome/extensão, "renomeado ou descrito", o que vai no multipart, e a otimização de fotos no navegador (reduz o lado maior para 2560 px, PNG sem transparência vira JPEG, com transparência fica PNG, não piora o arquivo, não mexe em PDF nem em imagem pequena)',
        },
        {
          path: 'lib/money.test.ts',
          tests: 2,
          covers: 'Formato em reais (R$ 1.500,50) e o total compacto da coluna do Kanban (mil/mi)',
        },
        {
          path: 'modules/realtime/realtime.test.ts',
          tests: 2,
          covers: 'Leitura do fluxo SSE em pedaços (comentários, CRLF) e o "(N)" no título da aba',
        },
        {
          path: 'modules/builder/lib/__tests__/process-map-flows.test.ts',
          tests: 10,
          covers: 'Automações no mapa de processos: quais fluxos aparecem em cada fase e como entram no mapa',
        },
        {
          path: 'modules/builder/lib/__tests__/process-automation-map.test.ts',
          tests: 3,
          covers: 'Automações por fase no mapa de processos',
        },
        {
          path: 'modules/experience-mode/lib/__tests__/simple-automations.test.ts',
          tests: 8,
          covers: 'Modo simplificado: automações "quando… então…" viram fluxo e voltam a ser lidas do fluxo',
        },
        {
          path: 'modules/experience-mode/experience-mode-store.test.ts',
          tests: 3,
          covers: 'Modo simplificado/avançado: a escolha some no login e logout, e o "lembrar minha escolha" fica por usuário',
        },
        {
          path: 'modules/flows/panels/ai-agent-action-form.test.tsx',
          tests: 11,
          covers:
            'Formulário do nó "LOPS IA": escolhe o agente numa lista (sem URL base nem slug digitados), mantém o campo de chave de API no nó (e pede a chave quando vazia), ao escolher o agente grava só slug e nome sem mexer na chave nem na URL salvas, mostra slug/modelo, avisa agente removido da lista, estado de carregamento e erro do servidor com "tentar novamente" e padrão de timeout vindo do servidor',
        },
        {
          path: 'modules/flows/components/FlowTestModal.test.tsx',
          tests: 2,
          covers:
            'Modal de teste do fluxo: mostra cada nó pelo nome, com o que as ações simuladas fariam, avisos e falhas',
        },
        {
          path: 'modules/admin/components/google-access-audit-card.test.tsx',
          tests: 10,
          covers:
            'Painel de permissões do Google no Admin: só para system.maintenance, auditar não altera nada, revogar exige confirmação com a contagem de afetados, resultado, token inválido, falhas e erro do servidor',
        },
        {
          path: 'modules/admin/views/admin-users-view.test.tsx',
          tests: 12,
          covers:
            'Painel de convidar/editar usuário: ocupa o lugar da lista e volta, Esc fecha dropdown → painel → Administração, perfil troca o badge, valida nome/e-mail/senha, prévia do convite ou aviso sem e-mail, cada forma de 1º acesso manda o payload e o aviso certos, erro mantém o painel aberto, editar valida e salva, reenviar convite e destaque da linha que some em 1,8 s',
        },
        {
          path: 'modules/admin/views/user-form-payload.test.ts',
          tests: 9,
          covers:
            'Formulário de usuário: convite, senha definida agora ou pré-cadastro viram o payload certo (senha digitada em outro método é descartada), edição só manda senha quando preenchida e o botão exige nome, e-mail válido e, quando a senha conta, a mesma regra do backend (8+, maiúscula, minúscula e número)',
        },
        {
          path: 'modules/admin/service-map/layout.test.ts',
          tests: 13,
          covers:
            'Mapa de serviços: canvas 792×338, caminhos reto, com faixa e vertical, deslocamento por tipo, cores e tracejado por estado, e opacidade com seleção',
        },
        {
          path: 'modules/admin/service-map/summary.test.ts',
          tests: 11,
          covers: 'Mapa de serviços: contadores da barra e pose e fala do Galo Sentinela em cada situação',
        },
        {
          path: 'modules/solicitations/lib/sla.utils.test.ts',
          tests: 21,
          covers: 'Rótulo, cor e tempo restante do SLA exibidos no card',
        },
        {
          path: 'modules/solicitations/lib/kanban-formatters.test.ts',
          tests: 9,
          covers: 'Tempo relativo e formatação de SLA',
        },
        {
          path: 'modules/builder/lib/__tests__/section-flow-layout.test.ts',
          tests: 13,
          covers:
            'Grafo de seções do builder (incluindo a posição salva no canvas vs. a linha reta calculada por padrão), a contagem de regras órfãs e os dados do nó: prévia dos 4 primeiros campos que recebem resposta, "+N campos", descrição e a seção aberta no modal',
        },
        {
          path: 'modules/flows/lib/field-variables.test.ts',
          tests: 3,
          covers:
            'Variáveis de campo do editor de fluxos: "Lista do ERP" oferece {{campo}} e {{campo_codigo}}, sem duplicar um campo de verdade com esse nome',
        },
      ],
    },
    {
      id: 'formularios-cliente',
      label: 'Builder e formulário público',
      focus: 'O estado do editor e o runtime que o respondente enxerga.',
      files: [
        {
          path: 'modules/builder/state/__tests__/builder-reducer.test.ts',
          tests: 35,
          covers:
            'Todas as ações do reducer do builder: seções, campos, opções, reordenação, duplicar campo (cópia logo abaixo, com código único), o id escolhido por quem adiciona campo ou seção e o teto de tamanho do código gerado a partir de um rótulo longo; renomear o campo de um parâmetro da "Tabela dinâmica do ERP" troca o código também na associação da tabela (antes ela ficava apontando para um código que não existia mais)',
        },
        {
          path: 'modules/builder/types.test.ts',
          tests: 20,
          covers:
            'mapDraftToCreatePayload repassa settingsJson (modo do formulário, identificação opcional) no payload de salvar — sem isso a configuração fica só na tela, nunca chega no backend; "Lista do ERP": padrões, sanitize que preserva conector e lista, e fora dos tipos de campo de fase e de pergunta padrão; um ícone por tipo do seletor e a busca sem acento; "Total de horas" logo após a Hora, como cálculo em horas, e volta a cálculo comum sem o formato; campo de arquivo sem máx. de arquivos/tamanho e com "exigir nome ou descrição" (padrão ligado); "E-mail de usuário" logo após o E-mail, como e-mail com sugestões, sanitize que guarda só ids e a trava, e volta a E-mail comum sem as sugestões',
        },
        {
          path: 'modules/forms/formula.test.ts',
          tests: 60,
          covers:
            'Motor de fórmulas do cliente — precisa dar o mesmo resultado do backend, incluindo SOMAPRODUTO e SOMAQUOCIENTE sobre colunas de uma tabela de produtos e a extração de colunas pro testador do builder; DURACAO entre dois campos de Hora e o resultado em 8h30; horas × valor da hora em R$ sem perder centavo',
        },
        {
          path: 'modules/forms/score-ranges.test.ts',
          tests: 11,
          covers:
            'Espelho do backend no cliente: pontos por opção, CONFORMIDADE, ATINGIRAM, MEDIAPREENCHIDOS e faixas do resultado dão os mesmos números do servidor',
        },
        {
          path: 'modules/builder/components/formula-score-settings.test.tsx',
          tests: 11,
          covers:
            'Editor de pontos do campo calculado: pontuar pergunta (Sim = 1, Não = 0), atalho da seção montando a CONFORMIDADE, Inverter, "conta" desmarcado, faixas com fase e o teste mostrando a faixa',
        },
        {
          path: 'modules/builder/components/builder-wizard-preview.test.tsx',
          tests: 2,
          covers:
            'Prévia do construtor mostra a identificação como o formulário público: obrigatória começa pela tela de entrada (valida nome e e-mail) e depois "Respondendo como"; opcional aparece acima das perguntas; desligada, nada aparece',
        },
        {
          path: 'modules/builder/components/formula-hours-picker.test.tsx',
          tests: 4,
          covers:
            '"Total de horas" no editor do cálculo: escolher a chegada completa a saída, escolher num lado a hora do outro inverte os dois (sem perder o "- 1" do almoço), sem dois campos de Hora pede para criá-los e não mostra casas decimais',
        },
        {
          path: 'modules/builder/components/score-field-editors.test.tsx',
          tests: 5,
          covers:
            '"Pontuação da seção" (perguntas da seção já pontuadas, sem tirar nem acrescentar, Inverter) e "Resultado da pontuação" (marco ou média, seções usadas pelo nome)',
        },
        {
          path: 'modules/builder/components/score-alert-editor.test.tsx',
          tests: 8,
          covers:
            'Aviso do Resultado da pontuação (ligar, enviar sempre ou só abaixo, pergunta que identifica a auditoria, assunto próprio, pessoas, outros e-mails, mínimo do resultado, o que falta, arte de fundo própria só no e-mail com a arte geral de reserva) e o limite próprio da Pontuação da seção',
        },
        {
          path: 'modules/email-images/email-background-picker.test.tsx',
          tests: 4,
          covers:
            'Escolha da arte de fundo do e-mail (Administração e aviso do formulário): prévia da arte própria ou da de reserva, trocar envia a imagem e devolve o id, "Voltar para…" limpa, recusa na hora o que não é JPG/PNG ou passa de 3 MB, e mostra o erro do servidor',
        },
        {
          path: 'modules/builder/lib/__tests__/score-fields.test.ts',
          tests: 9,
          covers:
            'Fórmula gerada dos campos de pontuação: pergunta nova entra sozinha, invertida fica, resultado com marco ou média sobre todas as seções, mensagens ao salvar e os dois tipos no seletor',
        },
        {
          path: 'modules/responses/utils/response-scorecard.test.ts',
          tests: 6,
          covers:
            'Quadro de pontuação da resposta e do card: respostas na ordem das seções, nota por seção com marco (atingiu/abaixo/sem nota), seção do outro caminho fora, resultado em destaque e formulário sem pontuação sem quadro',
        },
        {
          path: 'modules/responses/components/response-scorecard.test.tsx',
          tests: 3,
          covers:
            'Seletor "% | Pontos" do quadro de pontuação: pontos por seção e "x de y seções" no resultado, média em %, escolha lembrada no navegador e seletor escondido quando não há pontos',
        },
        {
          path: 'modules/public-form/form-runtime.test.ts',
          tests: 18,
          covers:
            'Visibilidade condicional, validação por tipo, derivação dos campos calculados, a tabela de produtos (linhas preenchidas pelo respondente mescladas com os valores fixos do criador) e a "Lista do ERP" (envia só o código; obrigatório sem escolha é cobrado); arquivo escolhido sem nome novo nem descrição barra o envio (a não ser com a exigência desligada)',
        },
        {
          path: 'modules/builder/components/user-email-settings-editor.test.tsx',
          tests: 2,
          covers:
            'Configuração do "E-mail de usuário": escolher pessoas específicas grava os ids e mostra nome + e-mail, voltar para "qualquer usuário" limpa a lista, e a trava "só e-mails sugeridos" liga sem perder as pessoas',
        },
        {
          path: 'modules/builder/components/download-file-editor.test.tsx',
          tests: 5,
          covers:
            'Envio do arquivo do campo "Arquivo para baixar" no construtor: processo não salvo bloqueia o envio, envio bem-sucedido grava o retorno no campo, recusa do servidor aparece sem mexer no campo, acima de 10 MB nem sai do navegador, e Remover limpa',
        },
        {
          path: 'modules/builder/components/builder-wizard-field-row.test.tsx',
          tests: 17,
          covers:
            'Editor de fórmula: inserir referência, os atalhos de tabela de produtos (gabarito do SOMAPRODUTO e um chip por coluna, sem colidir com um campo de mesmo nome), o testador simulando por coluna (SOMAPRODUTO e SOMAQUOCIENTE) em vez de um número solto pra tabela inteira, acusar erro e simular resultado; rótulo do campo (no painel aberto da linha) como textarea que cresce (não input de uma linha só) e bloqueia Enter',
        },
        {
          path: 'modules/builder/components/flow/SectionEditModal.test.tsx',
          tests: 12,
          covers:
            'Modal de seção do Fluxo: accordion de campos (uma linha aberta por vez, o grip não abre, Recolher, trocar de seção recolhe e limpa a busca), busca de campos com a numeração original e "Nenhum campo encontrado.", seletor de tipos (autofoco, filtro, adicionar abre a linha nova, trocar tipo marca o atual) e Esc fechando o seletor antes do modal',
        },
        {
          path: 'modules/builder/components/flow/SectionEditModal.erp-table.test.tsx',
          tests: 2,
          covers:
            'Parâmetro da "Tabela dinâmica do ERP" com a tabela como 1º campo da seção (caso de prod do "Registro de Reclamação - SAC"): avisa que não há campo antes dela e oferece criar; "Criar campo" põe um Número obrigatório antes da tabela, associa o parâmetro, o aviso some e a associação vai no payload de salvar — com o reducer de verdade',
        },
        {
          path: 'modules/builder/lib/__tests__/field-search.test.ts',
          tests: 10,
          covers:
            'Busca de campos da seção (rótulo sem acento, posição original), resumo "N campos · N obrigatórios" sem os decorativos e filtro do seletor de tipos (tipo ou grupo, grupos vazios somem, "Tabela dinâmica do ERP" só com a flag)',
        },
        {
          path: 'modules/builder/__tests__/field-type-choice.test.ts',
          tests: 7,
          covers: 'Lista suspensa no seletor de tipo do construtor (preset da seleção com displayAs, ida e volta, campo novo pelo menu) e "Colar lista" de opções (uma por linha, sem marcadores nem repetidas)',
        },
        {
          path: 'modules/item-lists/item-list-draft.test.ts',
          tests: 11,
          covers:
            'Listas de itens na tela: colar da planilha (uma coluna = nome, duas = código e nome, sem repetir), salvar mantendo ids, o que impede salvar; e o campo de seleção ligado (opções da lista, escondidas, ligar/desligar, vínculo que sobrevive a trocar o tipo e ao salvar, ao menos um item ativo); colunas próprias (valores nas células e de volta no tipo da coluna, números no jeito brasileiro, colar da terceira célula em diante nas colunas, o que impede salvar)',
        },
        {
          path: 'modules/item-lists/views/item-list-views.test.tsx',
          tests: 6,
          covers:
            'Módulo "Listas de itens" do menu lateral: cards com onde é usada e busca sem acento, estado vazio, criar colando da planilha e ir para a página da lista, aviso de alterações não salvas ao sair; e a origem das opções no campo (escolher lista liga, prévia, voltar a digitar desliga); adicionar coluna de seleção com opção colorida, preencher no item e salvar',
        },
        {
          path: 'modules/public-form/erp-table.test.ts',
          tests: 12,
          covers:
            'Regras da "Tabela dinâmica do ERP" no formulário: dependências (código da Lista do ERP, texto, número), recarga depois de 409 mantendo respostas e listando linhas novas/removidas, validação por célula, bloqueios (sem carregar, troca de pedido, conferência pendente) e o que vai no envio (só hash, chaves e colunas preenchíveis)',
        },
        {
          path: 'modules/public-form/item-order.test.ts',
          tests: 5,
          covers:
            'Regras do "Pedido de itens" no formulário: pesquisa sem acento por nome ou código (quem começa com o termo primeiro), item novo com a quantidade mínima, subtotal e total pelo preço da lista, obrigatório = pelo menos um item, erro por célula e o que vai no envio (só a chave do item e o preenchido)',
        },
        {
          path: 'modules/public-form/components/user-email-field.test.tsx',
          tests: 8,
          covers:
            'Campo "E-mail de usuário" no preenchimento: lista com nome e e-mail ao focar, clique e teclado escolhem, filtro sem acento, e-mail livre sem a trava; com "só e-mails sugeridos" o texto é só pesquisa e a escolha vira cartão com "Trocar"; validação local quando a lista está à mão; no publicado sem lista pesquisa no servidor a partir de 3 letras; logado usa os usuários do sistema filtrados pelas pessoas escolhidas',
        },
        {
          path: 'modules/public-form/components/item-order-field.test.tsx',
          tests: 7,
          covers:
            'Componente do "Pedido de itens": não mostra a lista inteira, só o que a pesquisa encontra; adicionar pelo clique ou Enter com a quantidade mínima, sem duplicar; total atualizado; remover; erro de mínimo na célula; na pré-visualização do construtor carrega a lista (só itens ativos) e a pesquisa funciona; sem lista escolhida, pede para escolher',
        },
        {
          path: 'modules/public-form/components/erp-table-field.test.tsx',
          tests: 8,
          covers:
            'Componente da "Tabela dinâmica do ERP": não consulta sem o pedido, carrega com o código, colunas do ERP só leitura, resposta pela chave da linha, confirmação ao trocar de pedido, recarga e conferência depois de 409, ERP fora com "Tentar novamente", estado vazio e pré-visualização do construtor',
        },
        {
          path: 'modules/public-form/components/erp-lookup-field.test.tsx',
          tests: 11,
          covers:
            'Campo "Lista do ERP" no formulário: pesquisa só a partir do mínimo de caracteres, modo lista filtrado no navegador sem acento, escolha com "Trocar", rótulo "Pedido — cliente — empresa" em duas linhas, ficha do item escolhido (alertas, resumo, situação em selo, abas com as tabelas primeiro, código/unidade como linha de apoio do produto), ficha no painel ao lado do formulário em tela larga com o X trocando a escolha, ficha indisponível sem travar a escolha, ERP fora, login exigido (link em outra aba), nenhum resultado e pré-visualização sem pesquisa',
        },
        {
          path: 'modules/public-form/components/public-question-field.test.tsx',
          tests: 20,
          covers:
            'Lista suspensa no lugar dos botões (única grava o valor, várias grava a lista; sem displayAs continuam os botões); campo calculado renderiza só leitura, com valor formatado; caixa de texto de 36 px sem prender a de várias linhas nessa altura; tabela de produtos reparte a largura das colunas proporcionalmente (produto não toma 100% do espaço livre) e tem largura mínima, rolando em vez de encavalar os cabeçalhos no formulário estreito; campo de arquivo: oferece "Tirar foto" só quando aceita imagem e há câmera, entrega a foto como arquivo pendente e avisa (em vez de descartar em silêncio) quando passa do tamanho ou do limite de arquivos; campo de arquivo sem limite de tamanho/quantidade, tipo não aceito avisado, nome e descrição por arquivo e o quanto a foto encolheu',
        },
        {
          path: 'modules/public-form/components/choice-dropdown.test.tsx',
          tests: 6,
          covers: 'Lista suspensa: placeholder, escolher e limpar, busca sem acento só com lista longa, várias com chips sem fechar a lista, e teclado (setas, Enter, Escape)',
        },
        {
          path: 'modules/public-form/identification.test.ts',
          tests: 11,
          covers:
            'Identificação no topo: formulário antigo mostra o bloco opcional, "obrigatória" força o bloco mesmo com "mostrar" desligado, exige nome e e-mail (e-mail preenchido sempre válido), os dois interruptores do construtor ficam coerentes (obrigatória liga mostrar; desligar mostrar desliga obrigatória) e só os erros de identificação do 422 viram mensagem no bloco',
        },
        {
          path: 'modules/public-form/views/public-form-view.test.tsx',
          tests: 8,
          covers:
            'Formulário público com a identificação: "(opcional)" envia sem nome/e-mail; "obrigatória" abre numa tela de entrada (título, descrição e aviso, sem nenhuma pergunta nem etapa), não passa em branco nem com e-mail inválido, Enter continua, depois mostra "Respondendo como" e manda nome e e-mail aparados; "Trocar" volta à entrada sem perder respostas; logado entra direto com a conta (conta sem nome só preenche e para na entrada); multi-etapas só registra progresso depois da entrada; "Responder novamente" mantém a pessoa identificada',
        },
      ],
    },
    {
      id: 'notificacoes-cliente',
      label: 'Notificações no editor e na caixa de entrada',
      focus:
        'O nó "Notificação": regras que concordam com o backend, formulário de configuração, histórico da execução e o sino do topo.',
      files: [
        {
          path: 'modules/flows/lib/notification-config.test.ts',
          tests: 21,
          covers:
            'Regras do nó no editor (espelham o backend): canal, assunto obrigatório só no e-mail, variáveis mal formadas, destinatários por tipo e canal (WhatsApp aceita grupo pelo JID), limites, atraso e retentativa; resumo do cartão e variáveis embutidas',
        },
        {
          path: 'modules/flows/lib/__tests__/flow-validation.notification.test.ts',
          tests: 14,
          covers:
            'Validação do desenho do fluxo com o nó action_notification (nó recém-arrastado bloqueia o salvamento) e compatibilidade com os nós de comunicação antigos',
        },
        {
          path: 'modules/flows/lib/__tests__/node-issues.test.ts',
          tests: 52,
          covers:
            'Pendências do modal de configuração de nó (getNodeIssues): mesmas regras e mensagens dos campos do painel, só campos visíveis contam (cron × intervalo, origem dos aprovadores, operação só com conector), e concordância com a validação do fluxo para todo tipo de nó recém-criado e configurado',
        },
        {
          path: 'modules/flows/lib/__tests__/node-outputs.test.ts',
          tests: 6,
          covers:
            'Variáveis para os próximos nós: ancestrais no grafo (o mais próximo primeiro), grupos "Deste nó/gatilho" e "Do gatilho", campos do formulário, caminhos de resposta da Verificação HTTP e a explicação de Agendado e Webhook, que não geram dados',
        },
        {
          path: 'modules/flows/panels/node-config/fields.test.tsx',
          tests: 14,
          covers:
            'Componentes de campo do modal de nó: Field (contador, dica, erro), Select e Input com sufixo, Segmentado e Cartões de escolha como rádios, Lista de checagem, Toggle (switch com descrição), pares chave/valor, Info e o Tab que preenche a sugestão do campo vazio',
        },
        {
          path: 'modules/flows/panels/node-config/section-nav.test.tsx',
          tests: 3,
          covers:
            'Etapas do modal de nó: pendência vai para a etapa do campo (órfã na primeira), tipo sem mapa cai numa etapa única, e a navegação mostra número na atual, "!" com "Falta preencher" na pendente e o resumo nas demais',
        },
        {
          path: 'modules/flows/panels/notification-action-form.test.tsx',
          tests: 34,
          covers:
            'Formulário do nó "Notificação": canal, destinatários de cada tipo (usuários, campo do formulário, payload…), validações inline, inserção de variável na posição do cursor, prévia com debounce (renderizada pelo backend, variáveis desconhecidas, truncamento, erro), opções de envio/atraso/retentativa/idempotência e a reabertura de um nó salvo',
        },
        {
          path: 'modules/flows/components/ExecutionNotifications.test.tsx',
          tests: 14,
          covers:
            'Notificações da execução no histórico: estado de cada destinatário com tentativas e erro, endereço mascarado × completo, envio agendado, e cancelar/reenviar só para quem tem flows.manage (nada é renderizado em execuções sem notificação)',
        },
        {
          path: 'modules/notifications/components/notification-bell.test.tsx',
          tests: 22,
          covers:
            'Sino da barra superior: contador (99+), lista, marcar como lida (uma/todas), aviso com link abre a tela citada (endereço externo não), estados vazio/carregando/erro e tempo relativo',
        },
      ],
    },
    {
      id: 'documentacao',
      label: 'Conteúdo da documentação',
      focus: 'Impede que a documentação e o manual apodreçam em silêncio.',
      files: [
        {
          path: 'modules/admin/docs/content/__tests__/docs-content.test.ts',
          tests: 18,
          covers: 'Integridade do catálogo técnico: slugs, grupos, diagramas, tabelas e busca',
        },
        {
          path: 'modules/help/content/__tests__/help-content.test.ts',
          tests: 15,
          covers: 'Integridade do manual do usuário e da ajuda contextual por rota',
        },
        {
          path: 'modules/admin/docs/content/__tests__/test-inventory.test.ts',
          tests: 6,
          covers: 'Confronta este inventário com o disco, nos dois sentidos — é o que impede a página de virar ficção',
        },
      ],
    },
    {
      id: 'app',
      label: 'Infraestrutura do app e telas',
      focus: 'Permissões no cliente, utilitários e componentes com comportamento próprio.',
      files: [
        {
          path: 'modules/records/views/records-view.test.tsx',
          tests: 7,
          covers:
            'Registros (substituiu Respostas): ?solicitacao= abre o registro por cima da lista e fechar tira só esse parâmetro; link antigo /respostas/:id cai nos Registros com o registro aberto; o relatório só aparece com "exportar respostas" no processo; 403 fala de acesso ao processo',
        },
        {
          path: 'modules/records/lib/records-lib.test.ts',
          tests: 9,
          covers: 'Registros: atalhos de período no fuso local, filtros que vão ao servidor, texto dos chips, colunas guardadas que sumiram e modelo de relatório com coluna que o processo perdeu',
        },
        {
          path: 'modules/responses/utils/response-formatters.test.ts',
          tests: 16,
          covers:
            'Exibição da resposta troca o internalValue por rótulo em seleção única/múltipla, formata o campo calculado com prefixo/sufixo/decimais e monta a tabela de produtos com colunas dinâmicas',
        },
        { path: 'lib/permissions.test.ts', tests: 6, covers: '`hasPermission` no cliente' },
        {
          path: 'lib/process-permissions.test.ts',
          tests: 5,
          covers:
            '`canInProcess` — permissão no processo pelo vínculo com ele, códigos antigos valendo pelos novos, vínculo sem caixinha ainda vê o processo, sem processo = em algum (menus), sistema ignora o processo e acesso total',
        },
        {
          path: 'modules/process-access/components/process-grants-editor.test.tsx',
          tests: 4,
          covers:
            'Caixinhas do vínculo: resumo (modelo, personalizado, só vê), escolher modelo marca as caixinhas, mexer numa caixinha vira Personalizado e "ver solicitações" só nas minhas',
        },
        {
          path: 'modules/process-access/components/phase-participation.test.ts',
          tests: 2,
          covers:
            'Fases em que a pessoa atua e aprova (por ela ou pelo perfil), fases abertas a quem atua no processo, fase final de fora e fase antiga de perfil único',
        },
        {
          path: 'lib/permission-nav.test.ts',
          tests: 7,
          covers:
            '`filterByPermission` — itens de menu que o usuário pode ver; com o acesso por processo, Fluxos só com flows.view em algum processo e Listas de itens só com item_lists.manage ou forms.edit, no menu e nos atalhos do Início',
        },
        {
          path: 'app/router.test.tsx',
          tests: 2,
          covers: 'Rotas: "/" casa a rota-índice dentro do RequireAuth (redireciona para /inicio em vez de tela branca) e as páginas do app seguem para o AppShell',
        },
        { path: 'components/ui/button.test.tsx', tests: 4, covers: 'Variantes e estados do botão, incluindo o ghost legível no tema escuro' },
        { path: 'components/ui/card.test.tsx', tests: 2, covers: 'Composição do card' },
        {
          path: 'components/camera-capture-button.test.tsx',
          tests: 9,
          covers:
            'Botão "Tirar foto": câmera nativa (input capture) em celular/tablet; diálogo com webcam no computador (captura JPEG, desliga a câmera ao capturar/cancelar/Esc, não reinicia a câmera quando o pai re-renderiza); mensagens para permissão negada e câmera ausente; não aparece quando o aparelho não tem câmera',
        },
        { path: 'lib/cn.test.ts', tests: 2, covers: 'Concatenação de classes' },
        {
          path: 'styles/design-system-tokens.test.ts',
          tests: 4,
          covers:
            'Pacote @tijucas/ui: tokens.css, theme.css (Tailwind v4), preset do Tailwind v3 e tokens.json commitados batem com o que design-system/src/tokens.ts gera',
        },
        {
          path: 'modules/design-system/views/design-system-view.test.tsx',
          tests: 8,
          covers:
            'Vitrine pública `/design-system`: cada item do menu tem sua seção, as cores mostram os valores de tokens.ts nos dois temas, o botão copia o código do exemplo, os toasts de exemplo aparecem e o botão alterna claro/escuro; o seletor React / Next.js / HTML puro troca código e prévia (classes tj-*, toasts em JS puro), lembra a escolha e abre pelo link `?stack=`',
        },
        {
          path: 'modules/design-system/vanilla.test.ts',
          tests: 5,
          covers:
            '`@tijucas/ui/vanilla` para sistemas sem React: showToast cria e remove o aviso (sem interpretar HTML do título), setTheme/toggleTheme/getTheme, productLogoHtml escapa os textos e productMarkSvg com e sem label',
        },
        {
          path: 'modules/kanban-phases/components/phase-fields-modal.test.tsx',
          tests: 11,
          covers:
            'Seção "Histórico do processo": agrupa valores e anexos de fases anteriores por fase (ordenadas, excluindo a fase atual), formata texto/número/booleano/JSON, ignora campos sem conteúdo e campos do tipo foto (aparecem como anexo, não como texto); "Anexos desta fase": mostra os anexos vinculados à fase atual (ex.: foto enviada no formulário de origem, não um campo de fase) mesmo sem campos próprios configurados',
        },
        {
          path: 'modules/kanban-phases/components/phase-field-values-summary.test.tsx',
          tests: 8,
          covers:
            'Resumo dos valores enviados na fase (ex.: quantidade produzida): lista só campos com valor na ordem da fase, ignora campos de arquivo e vazios, trata zero como valor válido e não renderiza nada sem dados; número no formato brasileiro, "Valor (R$)" com o texto visto e "Cálculo" sempre em R$',
        },
        {
          path: 'modules/kanban-phases/components/phase-fields-modal-values.test.tsx',
          tests: 10,
          covers:
            'Modal da fase no Kanban: quem não preenche a fase (aprovador) vê a quantidade enviada em destaque no lugar do campo esmaecido; operador e quem gerencia tudo continuam com o campo editável; sem valores enviados o formulário é mantido; telas pequenas e tema escuro: neutros do campo seguem os tokens do tema (rótulo legível) e o título longo quebra linha em vez de ser cortado; validação antes de salvar (obrigatório vazio mostra o erro no campo e não envia; título/descrição da fase não vão no envio); usuário escolhido para atuar preenche mesmo sem o perfil, e quem está fora da lista vê o aviso',
        },
        {
          path: 'modules/kanban-phases/components/kanban-phases-editor.test.tsx',
          tests: 5,
          covers:
            'Editor de fases do formulário: card resume a fase (quem atua, campos e obrigatórios); a engrenagem abre a configuração, "Aplicar" muda só o rascunho e marca "Alterações não salvas", "Salvar fases" grava tudo; cancelar não muda nada; "Editar campos" abre na aba de campos; fase nova já abre a configuração',
        },
        {
          path: 'modules/kanban-phases/components/phase-field-row.test.tsx',
          tests: 10,
          covers:
            'Campo de fase no editor: seletor visual de tipo (sem ERP; troca começa da configuração padrão do tipo novo; Lista suspensa vira a seleção com displayAs e volta sem ele), conteúdo sem obrigatório/código, checkbox obrigatório = marcado, opção salva mantém o valor ao renomear e nova acompanha o nome, colar lista sem repetir valores, reordenar opções e campo, ajustes de número; "Cálculo (R$)" com atalhos dos campos do formulário e das fases (sem o próprio), formato fixo e sem obrigatório; "Total de horas" com chegada e saída, gravado em horas',
        },
        {
          path: 'modules/kanban-phases/components/phase-sla.test.tsx',
          tests: 8,
          covers: 'Prazo da fase na tela: textos de duração, editor (dias úteis = 10h, alerta em %, digitação sem gravar no meio, fase final sem prazo), selo do card e linha do tempo com alteração de prazo para quem gerencia as fases',
        },
        {
          path: 'modules/kanban-phases/components/kanban-card-value-setting.test.tsx',
          tests: 2,
          covers: '"Valor do card" no mapa do processo: mostra o campo gravado, oferece só campos de valor (o "Total de horas" fica de fora) com a fase de cada um e grava o campo escolhido na hora',
        },
        {
          path: 'modules/kanban-phases/components/phase-settings-modal.test.tsx',
          tests: 10,
          covers:
            'Modal "Configurar fase" (engrenagem no editor de fases): resumo no topo (campos/obrigatórios, quem atua, automações), fluxos que reagem à fase com link, aplicar devolve a fase editada sem gravar, abre na aba pedida, todas as abas ficam montadas (tamanho fixo ao trocar), quem atua e quem aprova com vários perfis e usuários (busca por nome/e-mail), bloqueia aprovação sem ninguém para aprovar, Esc não descarta edição pendente, fase nova sem fluxos e aba de automações sem acesso a fluxos; quem aprova pela janela de aprovadores com a regra; quando pedir a aprovação e o que fazer se aprovarem/reprovarem',
        },
        {
          path: 'modules/kanban-phases/components/phase-required-exit-toggle.test.tsx',
          tests: 5,
          covers: '"Só avançar com os obrigatórios preenchidos" na aba Formulário da fase: liga e desliga, e ligada sem nenhum campo obrigatório avisa que a trava não segura nada; "Só avançar com responsável" liga e desliga; "Ponto sem volta" liga e desliga e, com reprovação que segura o card, avisa que só quem configura as fases devolve',
        },
        {
          path: 'modules/kanban-phases/components/phase-fields-modal-required-exit.test.tsx',
          tests: 5,
          covers: 'Card em fase com a trava: diz quais obrigatórios salvos faltam, fases seguintes ficam desabilitadas no "Mover para fase" e a anterior continua livre; com tudo salvo ou sem a trava, nada muda; fase que exige responsável junta a falta dele no mesmo aviso e libera com alguém atribuído',
        },
        {
          path: 'modules/kanban-phases/components/phase-approval-automation-editor.test.tsx',
          tests: 3,
          covers: 'O que a fase faz sozinha com a aprovação: na 1ª fase o formulário é o de abertura (com os anexos) e não há fase anterior para voltar; na última não há próxima para seguir; cada escolha muda só a sua opção',
        },
        {
          path: 'modules/kanban-phases/components/phase-fields-modal-approval.test.tsx',
          tests: 5,
          covers:
            'Aprovação dentro do card da fase: quem aprova vê o aviso, os aprovadores e decide ali mesmo; reprovar sem comentário pede o motivo; quem não aprova vê só o andamento; aprovação pedida por fluxo (sem fase) também é decidida no card; pendências de outras solicitações são ignoradas',
        },
        {
          path: 'modules/kanban-phases/components/phase-card-filter-modal.test.tsx',
          tests: 4,
          covers:
            'Configurações da fase no Kanban (engrenagem da coluna): sem regras explica que todos veem; só oferece campos de lista, caixa e texto curto (os de fase com o nome da fase); regra incompleta não grava e diz o que falta; monta campo + respostas + perfil + usuário e grava com "quem não está em regra não vê nenhum"; texto curto vira chips sem repetir; abre com o filtro salvo e tirar a última regra desliga',
        },
        {
          path: 'modules/kanban-phases/components/card-display-modal.test.tsx',
          tests: 4,
          covers:
            '"Personalizar card" (ícone da coluna no Kanban): pessoa comum só ajusta o próprio card, partindo do padrão, e sem mudança não grava; liga/desliga indicadores, acrescenta campo com rótulo próprio e grava normalizado; quem já ajustou volta ao padrão da fase; campo que saiu do processo aparece marcado; quem configura as fases grava o padrão da fase na outra aba',
        },
        {
          path: 'modules/kanban-phases/lib/card-display.test.ts',
          tests: 7,
          covers:
            'Editor do "Personalizar card": sem configuração vale o card de sempre; liga/desliga indicador; campo sem repetir e no limite; reordenar, renomear e tirar; formato gravado (ordem do editor, rótulo vazio vira null) e comparação; número curto e tempo na fase',
        },
        {
          path: 'modules/kanban-phases/lib/phase-card-filter.test.ts',
          tests: 2,
          covers:
            'Campos do filtro de cards: formulário primeiro (ganha no código repetido), depois os das fases, só tipos comparáveis; nome da resposta; o que falta numa regra e o formato enviado à API',
        },
        {
          path: 'modules/kanban-phases/components/phase-visibility-editor.test.tsx',
          tests: 4,
          covers:
            '"Quem vê esta fase": começa em "Todos com acesso"; "Só quem eu escolher" marca vários perfis, áreas e usuários (com busca), avisa quando ninguém foi escolhido e tira pelo chip; valor salvo que não existe mais aparece para ser tirado; resumo curto dos chips',
        },
        {
          path: 'modules/kanban-phases/lib/phase-automations.test.ts',
          tests: 1,
          covers:
            'Fluxos que tocam uma fase: gatilho de campos salvos (da fase ou de qualquer fase), mover para a fase e esperar os campos dela; ignora os que não tocam e ordena ativos primeiro',
        },
        {
          path: 'modules/kanban-phases/lib/phase-form-sections.test.ts',
          tests: 7,
          covers:
            'Seções do formulário de uma fase no mapa do processo (cada campo "Título" abre uma seção): agrupa com seção inicial sem título, acrescenta seção com código livre, troca os campos de uma seção, remove seção com os campos e move seções mantendo a sem título no começo',
        },
        {
          path: 'modules/kanban-phases/lib/phase-section-flow.test.ts',
          tests: 9,
          covers:
            'Caminho do formulário da fase no rascunho: vem do servidor por id e volta pelo código, renomear o código não quebra a seta, padrão sem ramificação some, remover seção limpa as setas, regra quebrada impede salvar; no card só as seções do caminho; no mapa, disposição por níveis com o desvio uma linha abaixo',
        },
        {
          path: 'modules/kanban-phases/lib/phase-required-exit.test.ts',
          tests: 7,
          covers: 'Espelho no navegador da trava de saída da fase: sem a trava nada segura; obrigatórios em branco na ordem (texto com espaços, checkbox desmarcado, pedido sem item); layout, cálculo e opcional de fora; número zero conta; seção fora do caminho do formulário não é cobrada; falta de responsável e campos juntos no aviso do card (com responsável ou sem trava, nada segura)',
        },
        {
          path: 'modules/kanban-phases/lib/phase-move-back.test.ts',
          tests: 6,
          covers: 'Espelho no quadro do "ponto sem volta": avançar nunca é segurado; voltar para antes da coluna marcada é segurado, inclusive saindo dela; até ela pode; cruzando duas vale a mais à frente; coluna desconhecida não segura; mensagem igual à do servidor',
        },
        {
          path: 'modules/kanban-phases/lib/phase-approval-block.test.ts',
          tests: 3,
          covers:
            'Lê a trava de aprovação da fase devolvida ao mover o card (código, fase, aprovadores, se pode pedir); outro erro ou servidor antigo não vira trava; nomes dos aprovadores juntados com "ou"',
        },
        {
          path: 'modules/kanban-phases/components/phase-approval-block-dialog.test.tsx',
          tests: 5,
          covers:
            'Pop-up "Aprovar ao mover": diz quem aprova e pede a aprovação ao confirmar (o card fica na fase), cancelar não pede nada, falha ao pedir mantém o pop-up, quem não pode pedir só é avisado, aprovação já pendente mostra a mensagem do servidor',
        },
        {
          path: 'modules/kanban-phases/lib/phase-draft.test.ts',
          tests: 12,
          covers:
            'Rascunho das fases: ida e volta da configuração com obrigatório preservado (aprovador só vai quando exige aprovação), problemas que impedem salvar (sem fase, aprovador faltando, código repetido, campo sem nome, seleção sem opção, opção sem nome ou repetida; divisor pode ficar sem nome) e o envio sem a marca interna das opções novas; visibilidade restrita sem ninguém escolhido não salva, "Todos com acesso" grava null e toDraft liga a restrição só com alguém escolhido; cobra a fórmula do cálculo de fase; prazo da fase vai e volta (fase final ou sem horas não manda prazo); o que a fase faz sozinha com a aprovação vai e volta (sem aprovação, ou fase antiga, fica no padrão); "só avançar com os obrigatórios preenchidos" e "com responsável" vão e voltam (fase antiga fica desligada)',
        },
        {
          path: 'modules/kanban-phases/lib/phase-formula.test.ts',
          tests: 5,
          covers: 'Prévia do "Cálculo" de fase no card: respostas do formulário, valor em edição e valores salvos (o formulário ganha); "Total de horas" no seletor de fase logo após a Hora, formato fixo em horas (os outros seguem em R$), prévia em horas que entra no valor em R$ sem perder centavo e o card mostrando 8h30',
        },
        {
          path: 'modules/auth/queries/auth.queries.test.tsx',
          tests: 1,
          covers:
            'Sair limpa todo o cache do usuário anterior (sino, aprovações, solicitações…) e deixa a sessão nula — quem entra em seguida no mesmo navegador não vê nada do outro',
        },
        {
          path: 'modules/flows/hooks/useFlowEditor.autosave.test.tsx',
          tests: 4,
          covers:
            'Editor de fluxo: só abrir (inclusive no StrictMode) ou o React Flow medir/selecionar nós não grava; mover um nó grava depois da pausa; mexer e desfazer não grava',
        },
        {
          path: 'hooks/use-escape-key.test.tsx',
          tests: 2,
          covers:
            'Esc fecha só o modal de cima (card → solicitação → respostas); desligado enquanto salva',
        },
        {
          path: 'modules/admin/lib/audit-labels.test.ts',
          tests: 4,
          covers:
            'Auditoria em português e sem "[object Object]": lista/objeto viram contagem, texto longo é cortado, código desconhecido passa como veio',
        },
        {
          path: 'modules/admin/lib/solicitation-status-chart.test.ts',
          tests: 3,
          covers:
            'Painel operacional: status antigos e novos na mesma barra (sem "Nova" duplicada) e ativas descontando canceled/resolved',
        },
        {
          path: 'modules/public-form/field-a11y.test.ts',
          tests: 2,
          covers:
            'Formulário público: campo com erro marcado como inválido para o leitor de tela e foco no primeiro erro ao barrar o avanço',
        },
        {
          path: 'modules/auth/views/accept-invite-view.test.tsx',
          tests: 7,
          covers:
            'Página pública /convite/:token: mostra nome e e-mail do convidado, cria a senha e entra (sessão aberta, vai para /inicio), regra da senha e confirmação antes de enviar, link inválido/expirado/usado (404) sem formulário, convite gasto entre abrir e enviar, erro de rede com nova tentativa e limite de tentativas (429)',
        },
        {
          path: 'pages/external-approval-page.test.tsx',
          tests: 25,
          covers:
            'Página pública /aprovar/:token (sem login): detalhes da aprovação e da solicitação, link inválido (404), falha de rede com nova tentativa, estados decidida/expirada/encerrada sem formulário nem dados, meta noindex/no-referrer, e a decisão — escolher aprovar/reprovar, confirmar o e-mail, reprovar exige motivo, e-mail que não confere (403) mantém o formulário, link bloqueado/decidido/inválido ao enviar (410/404) vira o estado certo, erro genérico, botão bloqueado durante o envio',
        },
        {
          path: 'modules/approvals/views/approvals-view.test.tsx',
          tests: 2,
          covers:
            'Link do e-mail de aprovação (/aprovacoes?id=…) abre a decisão direto; aprovação que não está mais na fila mostra aviso',
        },
        {
          path: 'modules/approvals/components/external-step-info.test.tsx',
          tests: 14,
          covers: 'Etapa de aprovador externo na tela da solicitação: rótulo (e-mail marcado como externo), situação do link (não enviado/expirado/enviado e validade) e o botão "Reenviar link" só para quem gerencia, com aviso de sucesso, de e-mail que não saiu e de erro da API',
        },
        {
          path: 'modules/approvals/components/create-approval-modal.test.tsx',
          tests: 9,
          covers: 'Modal "Nova aprovação" com aprovadores por e-mail: só e-mails basta, usuários e e-mails juntos, sem e-mails nada muda no envio, e-mail inválido e mais de 10 bloqueiam, e a ordem do modo sequencial inclui os e-mails; perfis e a regra todos/em ordem (e-mails no fim da fila)',
        },
        {
          path: 'modules/approvals/components/approvers-field.test.tsx',
          tests: 3,
          covers: 'Janela "Escolher aprovadores" (perfis e usuários, busca, cancelar não muda), regra qualquer um/todos/em ordem com a fila numerada e reordenável, e a ordem guardada só de quem está',
        },
        {
          path: 'modules/flows/panels/approval-email-settings.test.tsx',
          tests: 3,
          covers:
            '"Avisar quem aprova por e-mail" do nó Criar aprovação: ligar mostra o assunto padrão e "Editar e-mail"; o modal parte do texto padrão, insere variável no campo em foco, mostra a prévia e salva no nó; variável mal formada bloqueia o salvar e "Restaurar padrão" volta ao texto de fábrica',
        },
        {
          path: 'modules/flows/panels/approval-action-form.test.tsx',
          tests: 17,
          covers: 'Formulário do nó "Criar aprovação" com aprovador externo: e-mails na lista fixa (normaliza, mostra o salvo, mantém o inválido para a validação bloquear, apagar remove a configuração), cobrança de aprovador, e a opção "Permitir aprovador externo" nos modos campo e dinâmico (desligada por padrão, aviso de risco e de SMTP quando ligada)',
        },
        {
          path: 'modules/approvals/components/decide-approval-modal.test.tsx',
          tests: 3,
          covers:
            'Modal "Decidir" do aprovador: mostra os dados enviados pelo operador na fase da aprovação (ex.: quantidade produzida); não busca nem mostra valores quando a aprovação não é de fase ou quando nada foi preenchido',
        },
        {
          path: 'modules/solicitations/components/solicitation-erp-details.test.tsx',
          tests: 3,
          covers:
            '"Dados do ERP" na aprovação e no card da fase: ficha de cada "Lista do ERP" respondida (alertas e resumo), ERP fora mostra o nome gravado e "Consultar de novo", recolher esconde a ficha, solicitação sem campo do ERP não renderiza nada',
        },
        {
          path: 'modules/solicitations/hooks/use-solicitations-management.test.tsx',
          tests: 3,
          covers:
            'Link direto para uma solicitação (?solicitationId=): o card abre mesmo antes de a lista carregar; card sem acesso (403/404, como o escondido pelo filtro de cards da fase) avisa, não tenta de novo e abre o primeiro da lista, e escolher outro tira o aviso; erro de servidor não troca o card nem avisa',
        },
        {
          path: 'modules/solicitations/components/attachment-display.test.tsx',
          tests: 6,
          covers:
            'Anexos da solicitação: arquivo que não está mais no servidor avisa ao baixar (e some o botão) e direto na imagem sem prévia, outro erro pede para tentar de novo; visualizar sem baixar abre o PDF numa janela, não oferece o que o navegador não mostra e avisa na janela quando o arquivo sumiu',
        },
        {
          path: 'modules/approvals/components/approval-modal-shell.test.tsx',
          tests: 5,
          covers:
            'Casca responsiva dos modais de aprovação: dialog acessível nomeado pelo título, título que quebra linha (não trunca), coluna única encolhível com overflow-x cortado (evita o card estourar com título/nome de arquivo longo), rodapé de ações fixo e botão de fechar',
        },
      ],
    },
  ],
};

export const INTEGRATION_SUITE: TestSuite = {
  id: 'integracao',
  label: 'Integração (API real)',
  runner: 'Jest + Supertest contra Postgres',
  command: 'npm --prefix backend run test:integration',
  pattern: 'backend/test/integration/*.integration.spec.ts',
  groups: [
    {
      id: 'api',
      label: 'API de ponta a ponta',
      focus: 'Sobe a aplicação inteira contra um banco real e exercita o caminho completo por HTTP.',
      files: [
        {
          path: 'test/integration/api.integration.spec.ts',
          tests: 5,
          covers:
            'Saúde Aurora Flow, login do admin semente, logout/refresh, 404 das rotas públicas de formulário e CRUD mínimo de fluxo independente',
        },
      ],
    },
  ],
};

export const TEST_SUITES: TestSuite[] = [BACKEND_SUITE, FRONTEND_SUITE, INTEGRATION_SUITE];

export function countSuiteTests(suite: TestSuite): number {
  return suite.groups.reduce(
    (total, group) => total + group.files.reduce((sum, file) => sum + file.tests, 0),
    0,
  );
}

function countGroupTests(group: TestGroup): number {
  return group.files.reduce((sum, file) => sum + file.tests, 0);
}

/** Uma seção por grupo de testes, com a tabela gerada do inventário. */
function groupSections(suite: TestSuite, rootPath: string): DocSection[] {
  return suite.groups.map((group) => ({
    id: `${suite.id}-${group.id}`,
    title: `${group.label} (${countGroupTests(group)})`,
    blocks: [
      { kind: 'paragraph', text: group.focus },
      {
        kind: 'table',
        columns: ['Arquivo', 'Testes', 'O que cobre'],
        caption: rootPath,
        rows: group.files.map((file) => [`\`${file.path}\``, String(file.tests), file.covers]),
      },
    ],
  }));
}

const TOTAL = TEST_SUITES.reduce((sum, suite) => sum + countSuiteTests(suite), 0);

export const QUALIDADE_ARTICLES: DocArticle[] = [
  {
    slug: 'testes',
    title: 'Testes automatizados',
    group: 'qualidade',
    icon: FlaskConical,
    summary:
      'Inventário completo das suítes de teste, o que cada grupo protege e como rodar cada uma.',
    tags: [
      'teste',
      'testes',
      'jest',
      'vitest',
      'spec',
      'cobertura',
      'coverage',
      'qualidade',
      'ci',
      'supertest',
      'integração',
      'mock',
    ],
    sourcePaths: {
      backend: 'backend/src/**/*.spec.ts, backend/test/integration',
      frontend: 'frontend/src/**/*.test.ts(x)',
    },
    primary: [
      {
        id: 'panorama',
        title: 'Panorama',
        blocks: [
          {
            kind: 'paragraph',
            text: `São **${TOTAL} testes** em três suítes independentes. Duas rodam sem nenhuma dependência externa e são as que travam o desenvolvimento no dia a dia; a terceira precisa de um Postgres e existe para provar que as peças conversam de verdade.`,
          },
          {
            kind: 'table',
            columns: ['Suíte', 'Testes', 'Runner', 'Precisa de banco'],
            rows: TEST_SUITES.map((suite) => [
              suite.label,
              String(countSuiteTests(suite)),
              suite.runner,
              suite.id === 'integracao' ? 'Sim' : 'Não',
            ]),
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'As contagens saem do runner, não de contagem manual',
            text: 'Os números vêm de `jest --json` e `vitest --reporter=json`. Contar `it(` no arquivo dá menos, porque um `it.each` com dez casos é uma linha só e dez testes — o validador de formato, por exemplo, tem 9 blocos escritos e 64 testes executados.',
          },
        ],
      },
      {
        id: 'como-rodar',
        title: 'Como rodar',
        blocks: [
          {
            kind: 'code',
            code: `# Backend — ${countSuiteTests(BACKEND_SUITE)} testes, sem dependência externa
npm --prefix backend test
npm --prefix backend test -- src/modules/forms        # um recorte
npm --prefix backend test -- -t "atribuição"          # por nome do teste
npm --prefix backend test -- --coverage               # com cobertura

# Frontend — ${countSuiteTests(FRONTEND_SUITE)} testes em jsdom
npm --prefix frontend test
npm --prefix frontend run test:watch

# Integração — ${countSuiteTests(INTEGRATION_SUITE)} testes, sobe a app contra Postgres
npm --prefix backend run test:integration`,
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'A suíte de integração usa um banco separado',
            text: 'Ela aponta para `formhub_test` com `DB_SYNC=true` (ver `backend/test/integration/setup-env.ts`) e roda com `--runInBand`. Não aponte para o banco de desenvolvimento: o schema é sincronizado a cada execução.',
          },
        ],
      },
      {
        id: 'estrategia',
        title: 'O que é testado, e o que deliberadamente não é',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A régua é a mesma em todo o repositório: **teste o que decide**. Regra de acesso, máquina de estados, cálculo, parser e contrato de payload têm teste. Classe que só carrega dado (DTO, entidade, evento) e adaptador que só repassa chamada para um serviço externo não têm — e isso está declarado, não é esquecimento.',
          },
          {
            kind: 'paragraph',
            text: 'A lista de exclusões vive em `collectCoverageFrom`, em `backend/jest.config.ts`. É lá que se lê, com nome e sobrenome, o que ficou de fora da medição e por quê: módulos do Nest, DTOs, entidades, enums, guards, decorators, migrações, adaptadores do Google Workspace e alguns serviços ainda sem teste unitário.',
          },
          {
            kind: 'table',
            columns: ['Piso de cobertura', 'Valor'],
            rows: [
              ['Linhas', '55%'],
              ['Statements', '54%'],
              ['Funções', '51%'],
              ['Branches', '37%'],
            ],
            caption: 'backend/jest.config.ts — o build falha abaixo destes valores',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Piso, não meta',
            text: 'Esses números são a rede de segurança contra regressão de cobertura, não o alvo. Subir o piso sem antes escrever teste só faz o build falhar; o caminho é o inverso — cobrir o que decide e depois subir a régua.',
          },
        ],
      },
      {
        id: 'convencoes',
        title: 'Convenções',
        blocks: [
          {
            kind: 'list',
            items: [
              'Backend usa `*.spec.ts`; frontend usa `*.test.ts` / `*.test.tsx`. Quem define é o `testRegex` do Jest e o padrão do Vitest — trocar o sufixo faz o arquivo sumir da suíte sem nenhum aviso.',
              'O teste fica ao lado do que ele testa (`forms.service.ts` → `forms.service.spec.ts`), exceto onde já havia pasta `__tests__/` no frontend.',
              'Nome de teste é frase em português dizendo o comportamento esperado, não o nome do método: "cobra os campos de origem quando o cálculo é obrigatório", não "should validate".',
              'Serviço externo é sempre mockado. Nenhum teste unitário abre socket, e é por isso que a suíte de backend inteira roda em menos de um minuto.',
              'Quando um teste existe por causa de um bug específico, o comentário no topo diz qual era o bug. Sem isso, o próximo a passar por ali não sabe se pode simplificar.',
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Cuidado com o mock que esconde o defeito',
            text: 'A exportação CSV tinha teste e mesmo assim quebrou em produção: o teste mockava `qb.stream()` e lia só o primeiro byte, então passava mesmo com o `pg-query-stream` ausente derrubando o endpoint. Mock do que está sendo testado é teste de mentira — mocke a fronteira (o banco, o HTTP), nunca o comportamento sob teste.',
          },
        ],
      },
    ],
    secondary: [
      ...groupSections(BACKEND_SUITE, 'backend/src/'),
      ...groupSections(FRONTEND_SUITE, 'frontend/src/'),
      ...groupSections(INTEGRATION_SUITE, 'backend/'),
      {
        id: 'arquivos-config',
        title: 'Configuração das suítes',
        blocks: [
          {
            kind: 'files',
            items: [
              { path: 'backend/jest.config.ts', note: 'suíte unitária, exclusões de cobertura e pisos' },
              { path: 'backend/test/jest.integration.config.ts', note: 'suíte de integração' },
              { path: 'backend/test/integration/setup-env.ts', note: 'variáveis de ambiente do banco de teste' },
              { path: 'backend/__mocks__/', note: 'mocks manuais de módulos externos' },
              { path: 'frontend/vitest.config.ts', note: 'ambiente jsdom e setup' },
              { path: 'frontend/src/test/setup.ts', note: 'matchers do jest-dom' },
              {
                path: 'frontend/src/modules/admin/docs/content/qualidade.ts',
                note: 'este inventário — a fonte das tabelas acima',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'success',
            title: 'Este artigo é verificado por teste',
            text: '`test-inventory.test.ts` confere contra o disco que todo arquivo listado aqui existe e que todo arquivo de teste do repositório está listado. Renomear, apagar ou criar um spec sem atualizar este inventário quebra a suíte do frontend — é o que impede esta página de virar ficção.',
          },
        ],
      },
    ],
  },
];
