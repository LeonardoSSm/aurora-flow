// Usando funções para evitar o limite de linha de comando do Windows (8191 chars)
// quando há muitos arquivos staged ao mesmo tempo.
module.exports = {
  'backend/**/*.ts': () => 'npm --prefix backend run lint -- --fix',
  'frontend/**/*.{ts,tsx}': () => 'npm --prefix frontend run lint -- --fix',
  'erp-lookup/**/*.ts': () => 'npm --prefix erp-lookup run lint -- --fix',
};
