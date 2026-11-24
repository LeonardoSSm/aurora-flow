# Sistema de Identidade Visual (Brand)

Troque toda a identidade visual do FormHub alterando **uma única linha** em `brand/index.ts`.

## Como trocar de empresa

1. Crie uma pasta `frontend/src/brand/{empresa}/`
2. Copie os assets para `frontend/public/brand/{empresa}/`
3. Crie `config.ts` seguindo a interface `BrandConfig` de `brand/types.ts`
4. Crie `assets.ts` mapeando os paths dos arquivos em `/brand/{empresa}/`
5. Em `brand/index.ts`, troque o import:
   ```ts
   // Antes:
   export { tijucaConfig as brand } from './tijuca/config';
   // Depois:
   export { novaEmpresaConfig as brand } from './nova-empresa/config';
   ```
6. Execute `npm run dev` — toda a UI reflete a nova identidade.

## Como o sistema funciona

> As cores e fontes da Tijuca (`tijuca/config.ts`) vêm do pacote `@tijucas/ui`
> (`frontend/design-system/src/tokens.ts`), que leva o mesmo visual para outros sistemas.
> Para mudar a paleta da Tijuca, edite lá e rode `npm run tokens`.

1. `brand/index.ts` exporta o `brand` ativo (objeto `BrandConfig`).
2. `main.tsx` chama `applyBrandTheme(brand)` antes do React renderizar.
3. `applyBrandTheme` injeta todas as cores como CSS custom properties no `:root`.
4. O Tailwind CSS usa essas variáveis via `rgb(var(--color-primary-ch) / <alpha-value>)`.
5. Componentes usam `useBrand()` para acessar logos, backgrounds e metadados.

## Empresa x produto

`company` é a empresa dona da instalação (Tijuca Alimentos) e assina o login, os
formulários públicos e o tracking. `product` é o sistema (Tijuca Flow) e assina a
sidebar e o favicon.

A marca do produto **não é um asset de imagem**: vive em
`brand/components/product-logo.tsx` como SVG inline (`ProductMark`,
`ProductWordmark`, `ProductLogo`). Os traços usam `currentColor` e os nós usam
`var(--color-secondary)`, então a marca acompanha a cor do container e a paleta
do brand ativo sem gerar arquivo novo. O único arquivo estático equivalente é o
favicon (`assets.productMark` → `tijuca-flow-mark.svg`), referenciado direto no
`index.html`.

## Assets necessários para um novo brand

| Asset | Campo em `BrandConfig.logos` | Uso | Dimensões recomendadas |
|---|---|---|---|
| Logo horizontal branca | `horizontalWhite` | Fundos escuros (corporativo) | 320×80px |
| Logo horizontal colorida | `horizontalColor` | Header público, fundos claros | 320×80px |
| Logo vertical colorida | `verticalColor` | Tela de login | 280×320px |
| Ícone colorido | `icon` | Avatar, marca d'água | 64×64px (quadrado) |
| Ícone branco | `iconWhite` | Fundos escuros (corporativo) | 64×64px (quadrado) |
| Badge/escudo | `badge` | Opcional | livre |
| Wordmark (só texto) | `wordmark` | Opcional | livre |

| Background | Campo em `BrandConfig.backgrounds` | Uso |
|---|---|---|
| Fundo auth principal | `auth` | Tela de login (painel esquerdo) |
| Padrão decorativo escuro | `authPattern` | Sobreposição no painel de login |
| Padrão claro | `patternLight` | Cards, elementos decorativos |

## Cores obrigatórias

| Campo | Uso |
|---|---|
| `primary` | Botões, links, foco, sidebar |
| `primaryDark` | Hover de botões, sidebar items ativos |
| `primaryLight` | Fundo da tela de formulário público |
| `secondary` | Destaque, acento |
| `accent` | Terceira cor |
| `text` | Texto principal |
| `textMuted` | Texto secundário |
| `surface` | Fundo de cards |
| `background` | Fundo da aplicação |
| `border` | Bordas |
| `danger` | Erros |
| `success` | Sucesso |
| `warning` | Aviso |
