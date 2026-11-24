export enum FormFieldType {
  SHORT_TEXT = 'short_text',
  LONG_TEXT = 'long_text',
  NUMBER = 'number',
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  EMAIL = 'email',
  PHONE = 'phone',
  CPF = 'cpf',
  CNPJ = 'cnpj',
  CEP = 'cep',
  CURRENCY = 'currency',
  CALCULATED = 'calculated',
  SINGLE_SELECT = 'single_select',
  MULTI_SELECT = 'multi_select',
  CHECKBOX = 'checkbox',
  FILE_UPLOAD = 'file_upload',
  PRODUCT_TABLE = 'product_table',
  /** Opção escolhida de uma lista do banco do ERP, via API erp-lookup. Ver Docs/campo_lista_erp_plano.md. */
  ERP_LOOKUP = 'erp_lookup',
  /** Uma linha por item de uma tabela do ERP, com colunas preenchíveis. Ver Docs/campo_tabela_dinamica_erp_implantacao.md. */
  ERP_TABLE = 'erp_table',
  /** Itens pesquisados numa lista de itens, cada um com colunas preenchíveis (ex.: Quantidade). */
  ITEM_ORDER = 'item_order',
  SCALE = 'scale',
  RATING = 'rating',
  TITLE = 'title',
  DESCRIPTION = 'description',
  DIVIDER = 'divider',
  /** Arquivo enviado por quem edita o processo (ex.: termo para assinar) que o solicitante baixa. Não recebe resposta. */
  FILE_DOWNLOAD = 'file_download',
}
