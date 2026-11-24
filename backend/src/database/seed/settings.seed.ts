import type { DataSource } from 'typeorm';

const DEFAULT_SETTINGS = [
  {
    key: 'org.name',
    value: 'Aurora Flow',
    description: 'Nome da organização exibido no sistema',
    isPublic: true,
    valueType: 'string',
  },
  {
    key: 'org.support_email',
    value: '',
    description: 'E-mail de suporte exibido aos usuários',
    isPublic: true,
    valueType: 'string',
  },
  {
    key: 'security.password_min_length',
    value: '8',
    description: 'Tamanho mínimo de senha',
    isPublic: false,
    valueType: 'number',
  },
  {
    key: 'security.session_timeout_hours',
    value: '2',
    description: 'Expiração do access token em horas',
    isPublic: false,
    valueType: 'number',
  },
  {
    key: 'forms.max_fields_per_section',
    value: '50',
    description: 'Máximo de campos por seção de formulário',
    isPublic: false,
    valueType: 'number',
  },
  {
    key: 'forms.max_sections_per_form',
    value: '20',
    description: 'Máximo de seções por formulário',
    isPublic: false,
    valueType: 'number',
  },
  {
    key: 'integrations.google_sheets_enabled',
    value: 'true',
    description: 'Habilita integração com Google Sheets',
    isPublic: false,
    valueType: 'boolean',
  },
] as const;

export async function seedSettings(dataSource: DataSource): Promise<void> {
  const rows = DEFAULT_SETTINGS.map((s) => ({
    key: s.key,
    value: s.value,
    description: s.description,
    is_public: s.isPublic,
    value_type: s.valueType,
  }));

  const placeholders = rows
    .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
    .join(', ');

  const values = rows.flatMap((r) => [r.key, r.value, r.description, r.is_public, r.value_type]);

  await dataSource.query(
    `INSERT INTO app_settings (key, value, description, is_public, value_type)
     VALUES ${placeholders}
     ON CONFLICT (key) DO NOTHING`,
    values,
  );
}
