# Changelog

## 0.2.0 — 2026-10-22

- Sistemas sem React (HTML, EJS, Handlebars, JS puro): `css/components.css` com as classes
  `tj-btn`, `tj-card`, `tj-field`, `tj-input`, `tj-select`, `tj-page-header`, `tj-toast`, `tj-logo`
  — o mesmo visual dos componentes React, claro e escuro.
- `@tijucas/ui/vanilla`: `showToast`, `setTheme`/`getTheme`/`toggleTheme`, `productLogoHtml` e
  `productMarkSvg`. Também como `<script>` (`dist/vanilla.global.js`, `window.TijucasUI`).
- `@tijucas/ui/package.json` exportado, para servir os arquivos do pacote (ex.: `express.static`).
- `SectionHeader`: a descrição usa `text-tx-muted` explicitamente, em vez de herdar a cor.

## 0.1.1 — 2026-10-20

- `Button` `ghost`: texto em azul claro (`#93c5fd`) no tema escuro. Antes o azul da marca quase
  sumia sobre a superfície escura.
- README: passo de aprovação da publicação (aba Staged Packages do npm).

## 0.1.0 — 2026-10-20

- Primeira versão: tokens (CSS, JS, JSON), tema Tailwind v4, preset Tailwind v3 e os componentes
  `Button`, `Card`, `FieldLabel`, `TextInput`, `SelectInput`, `SectionHeader`, `ToastProvider`/`useToast`,
  `PasswordStrengthBar`, `ProductLogo`/`ProductMark`/`ProductWordmark` e `cn`.
