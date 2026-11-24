import type { ReactNode } from 'react';
import { ProductMark, ProductWordmark } from '../../../brand/components/product-logo';
import { useBrand } from '../../../brand/hooks/useBrand';
import { LoginFlowArt } from './login-flow-art';

/**
 * Moldura das telas de autenticacao (login e cadastro de senha).
 *
 * A arte de fluxo deixou de ser um painel de metade da tela e virou o fundo da
 * pagina inteira; o formulario flutua sobre ela num cartao. Dois ganhos em cima
 * do layout 50/50 anterior:
 *
 * - o cartao passa a ter contraste real contra o fundo, em vez de ser um bloco
 *   branco sobre uma area branca;
 * - some o caso especial de mobile. Antes o painel era `hidden lg:grid` e o
 *   login no celular ficava sem marca nenhuma; agora o fundo e o mesmo em
 *   qualquer largura e a marca so muda de posicao.
 *
 * O hub da arte (de onde saem os caminhos) e a marca precisam ficar no mesmo
 * ponto: em telas grandes, no centro da coluna da esquerda (25% da largura);
 * abaixo disso, no centro — com o cartao por cima, restando as rotas ao redor.
 */
function AuthBackdrop() {
  const brand = useBrand();

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_50%,#20489d_0%,#0d2154_72%)] lg:bg-[radial-gradient(70%_70%_at_25%_50%,#20489d_0%,#0d2154_72%)]" />

      {/* Telas grandes: a constelacao ocupa a tela toda, com o hub a 25%. */}
      <LoginFlowArt layout="field" className="absolute inset-0 hidden h-full w-full lg:block" />

      {/* Abaixo de lg o cartao ocupa o meio, entao a arte vira um bloco compacto atras da marca. */}
      <div className="absolute left-1/2 top-1/2 aspect-[380/448] h-[min(92vh,880px)] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 lg:hidden">
        <LoginFlowArt layout="cluster" className="h-full w-full" />
      </div>

      {brand.logos.horizontalWhite ? (
        <img
          src={brand.logos.horizontalWhite}
          alt=""
          className="absolute right-6 top-6 h-4 w-auto object-contain opacity-50 lg:right-8 lg:top-8 lg:h-5"
        />
      ) : null}
    </div>
  );
}

/**
 * Marca do produto. Escala com a largura porque a arte atras dela tambem escala
 * — em tamanho fixo o logo encolhe dentro do desenho em telas grandes.
 */
function AuthBrandLockup() {
  return (
    <div className="flex flex-col items-center gap-[clamp(8px,1.2vw,18px)]">
      <ProductMark className="!h-[clamp(52px,7vw,104px)] !w-[clamp(52px,7vw,104px)]" />
      <ProductWordmark className="!text-[clamp(26px,3.2vw,50px)]" />
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d2154] text-white">
      <AuthBackdrop />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-9 px-5 py-10 lg:grid lg:grid-cols-2 lg:gap-0 lg:px-8">
        <div className="flex items-center justify-center">
          <AuthBrandLockup />
        </div>

        <div className="flex w-full items-center justify-center">{children}</div>
      </div>
    </div>
  );
}
