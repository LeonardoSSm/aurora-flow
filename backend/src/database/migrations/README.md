# Migrations

Esta pasta contem as migrations versionadas do backend.

## Regras

- Em desenvolvimento, `DB_SYNC=true` pode ser usado apenas no bootstrap local.
- Em homologacao e producao, use `DB_SYNC=false`.
- Mudancas de schema devem entrar por migration, nunca depender de `synchronize`.

## Comandos

Gerar uma migration nova:

```bash
npx typeorm -d src/database/data-source.ts migration:generate src/database/migrations/NomeDaMigration
```

Executar migrations pendentes:

```bash
npx typeorm -d src/database/data-source.ts migration:run
```

Reverter a ultima migration aplicada:

```bash
npx typeorm -d src/database/data-source.ts migration:revert
```
