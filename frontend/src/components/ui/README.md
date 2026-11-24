# UI Pattern (Padrao Frontend)

Este diretorio concentra os componentes base de interface do projeto.

## Componentes base
- `Button`
- `Card`
- `FieldLabel`
- `TextInput`
- `SelectInput`
- `SectionHeader`

## Regra de padrao
- Novas telas devem reutilizar estes componentes ao inves de repetir classes Tailwind diretamente para botoes, cards e campos de formulario.
- Se um novo estilo for necessario, primeiro evoluir o componente base e depois reaproveitar em todas as telas.

## Onde mora o codigo
- Os componentes vivem no pacote `@tijucas/ui` (`frontend/design-system/src/components/`), que tambem e usado por outros sistemas React/Next.js. Os arquivos daqui so reexportam de la.
- Mudou um componente? Edite no pacote. Ver `frontend/design-system/README.md`.
