import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { ProductLogo } from '../../../../design-system/src';
import packageJson from '../../../../design-system/package.json';
import { useTheme } from '../../../hooks/use-theme';
// Classes tj-* do pacote: o modo HTML/JS puro da vitrine mostra elas funcionando.
import '../../../../design-system/css/components.css';
import { StackPicker, StackProvider } from '../stack';
import {
  ButtonsSection,
  CardsSection,
  ColorsSection,
  FieldsSection,
  LogoSection,
  SectionHeaderSection,
  StartSection,
  ToastsSection,
  TokensInCodeSection,
  TypographySection,
} from './sections';

const NAV = [
  { id: 'comecar', label: 'Começar' },
  { id: 'cores', label: 'Cores' },
  { id: 'tipografia', label: 'Tipografia' },
  { id: 'botoes', label: 'Botões' },
  { id: 'cards', label: 'Card' },
  { id: 'campos', label: 'Campos' },
  { id: 'cabecalho', label: 'Cabeçalho de página' },
  { id: 'toasts', label: 'Toasts' },
  { id: 'logo', label: 'Logo do produto' },
  { id: 'tokens', label: 'Cores em código' },
];

/**
 * Vitrine pública do pacote @tijucas/ui (design-system/): cada componente funcionando, com o
 * código para copiar. Usa os componentes do próprio pacote, então mostra exatamente o que outro
 * sistema recebe ao instalar.
 */
export function DesignSystemView() {
  return (
    <StackProvider>
      <Showcase />
    </StackProvider>
  );
}

function Showcase() {
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Design system — @tijucas/ui';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-base text-tx-primary">
      <header className="sticky top-0 z-20 border-b border-border-default bg-bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-primary dark:text-white">
            <ProductLogo markClassName="h-8 w-8" />
            <span className="hidden text-sm font-semibold text-tx-muted xl:inline">Design system</span>
          </div>
          <StackPicker className="order-last w-full justify-center md:order-none md:w-auto" />
          <div className="flex items-center gap-2">
            <code className="rounded-lg bg-bg-s3 px-2 py-1 text-xs font-semibold text-tx-secondary">
              @tijucas/ui v{packageJson.version}
            </code>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
              className="rounded-lg p-2 text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 py-10 sm:px-6">
        <nav aria-label="Seções" className="sticky top-28 hidden h-fit w-52 shrink-0 lg:block">
          <ul className="grid gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-2 text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-16">
          <div className="grid gap-3">
            <h1 className="font-headline text-4xl font-extrabold tracking-tight md:text-5xl">
              O visual do Aurora Flow, para qualquer sistema
            </h1>
            <p className="max-w-3xl text-lg text-tx-secondary">
              Cores, tema claro/escuro e componentes base num pacote npm, para React, Next.js ou HTML/JS
              puro. Escolha no topo o tipo do seu sistema: tudo nesta página é o pacote funcionando, e o
              código de cada exemplo dá o mesmo resultado.
            </p>
          </div>
          <StartSection />
          <ColorsSection />
          <TypographySection />
          <ButtonsSection />
          <CardsSection />
          <FieldsSection />
          <SectionHeaderSection />
          <ToastsSection />
          <LogoSection />
          <TokensInCodeSection />
        </main>
      </div>
    </div>
  );
}
