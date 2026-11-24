/**
 * Linguagem visual da barra lateral em um lugar so.
 *
 * A barra tem dois modos (aberta e recolhida) que renderizam arvores JSX
 * diferentes; enquanto as classes viviam soltas no JSX, qualquer ajuste de
 * design precisava ser feito duas vezes e as duas versoes divergiam. Toda
 * remodelacao da barra deve acontecer aqui — `sidebar-nav.tsx` cuida so de
 * estrutura, dados e estado.
 *
 * Decisoes de design desta versao:
 * - Estado ativo = `bg-white/15` + barra de 3px na cor secundaria. O antigo
 *   `bg-primary-container` (#142E6E) sobre o fundo #1A3C8F nao tinha contraste
 *   suficiente para localizar a pagina atual.
 * - A cor secundaria e a cor da navegacao: indicador de ativo e CTA. E o unico
 *   lugar quente da barra, entao ela nao compete com nada.
 * - Rodape em uma linha (avatar + identidade + acoes) no lugar dos tres blocos
 *   empilhados, que consumiam ~200px de altura util do menu.
 * - Densidade compacta: item com ~30px de altura (6px + linha de 13px + 6px),
 *   icone de 16px e barra de 240px (60px recolhida). Os 12 itens ocupam ~372px
 *   em vez de ~524px.
 *
 * `cn()` neste projeto e concatenacao simples (sem tailwind-merge): classes
 * conflitantes nao se sobrescrevem de forma previsivel. Por isso cada recipe
 * abaixo e completo e os estados (`*Active` / `*Idle`) so acrescentam
 * propriedades que a base nao define.
 */
export const sidebarTheme = {
  /**
   * No mobile a barra e uma gaveta: `fixed` fora da tela, sobreposta ao
   * conteudo. Antes ela era `w-full` no fluxo normal, entao o menu inteiro
   * empilhava acima da pagina e empurrava o conteudo para baixo. A partir de
   * `md` ela volta a ser coluna fixa do layout.
   */
  aside:
    'fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] overflow-y-auto bg-primary text-white transition-transform duration-300 md:sticky md:top-0 md:z-auto md:h-screen md:max-w-none md:flex md:flex-col md:overflow-hidden md:transition-[width,padding] md:duration-200',
  /** `invisible` tira a gaveta fechada da ordem de tabulacao no mobile. */
  asideMobileClosed: '-translate-x-full invisible md:visible md:translate-x-0',
  asideMobileOpen: 'translate-x-0',
  asideOpen: 'p-3 md:w-60',
  asideCollapsed: 'p-3 md:w-[60px] md:px-2',

  backdrop: 'fixed inset-0 z-40 bg-black/50 md:hidden',
  menuToggle:
    'grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-border-default bg-bg-surface text-tx-secondary transition-colors hover:bg-bg-s2 md:hidden',
  closeButton:
    'ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden',

  header: 'flex h-12 shrink-0 items-center gap-2 border-b border-white/10 pl-1.5 pr-0.5',
  headerCollapsed: 'grid h-12 shrink-0 place-items-center border-b border-white/10',

  nav: 'sidebar-scroll mt-3 grid grid-cols-1 content-start gap-3.5 overflow-y-auto overflow-x-hidden pr-0.5',
  navCollapsed: 'sidebar-scroll mt-3 grid content-start gap-3 overflow-y-auto overflow-x-hidden',
  sectionTitle: 'px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40',
  sectionDivider: 'border-t border-white/10 pt-3',

  item:
    'relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
  itemActive:
    "bg-white/15 font-semibold text-white before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand-secondary before:content-['']",
  itemIdle: 'font-medium text-white/75 hover:bg-white/10 hover:text-white',

  railItem: 'relative grid h-[30px] w-full place-items-center rounded-lg transition-colors',
  railItemActive:
    "bg-white/15 text-white before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand-secondary before:content-['']",
  railItemIdle: 'text-white/75 hover:bg-white/10 hover:text-white',

  submenuToggle:
    'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white',
  submenuToggleActive: 'text-white',
  submenuList: 'sidebar-scroll ml-9 grid max-h-56 grid-cols-1 gap-0.5 overflow-y-auto border-l border-white/15 pl-2',
  submenuItem: 'block truncate rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
  submenuItemActive: 'bg-white/15 text-white',
  submenuItemIdle: 'text-white/60 hover:bg-white/10 hover:text-white',
  submenuHint: 'px-3 py-1.5 text-xs font-medium text-white/45',

  footer: 'mt-3 grid grid-cols-1 gap-2.5 md:mt-auto',
  footerCollapsed: 'mt-3 grid grid-cols-1 gap-2.5',
  /**
   * CTA nao usa <Button>: o variant primary pinta um gradiente em
   * `background-image`, que continuaria por cima de qualquer `bg-*` passado por
   * className.
   */
  cta:
    'flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-brand-secondary px-3 py-2 text-[13px] font-bold text-[#23180A] transition-[filter] hover:brightness-95',
  railCta:
    'grid h-[34px] w-full place-items-center rounded-[10px] bg-brand-secondary text-[#23180A] transition-[filter] hover:brightness-95',

  userRow: 'flex items-center gap-2 border-t border-white/10 pt-2.5',
  /** Recolhida: o rodape mostra so o avatar; tema e sair ficam na barra aberta. */
  userRowCollapsed: 'flex justify-center border-t border-white/10 pt-2.5',
  avatar: 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-[10.5px] font-bold',
  userIdentity: 'grid min-w-0 flex-1',
  userName: 'truncate text-[12px] font-semibold leading-tight text-white',
  userEmail: 'truncate text-[10.5px] leading-tight text-white/55',
  iconButton:
    'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-white/70 transition-colors hover:bg-white/10 hover:text-white',
  /** Abre/fecha a barra no desktop (Ctrl/Cmd+B). */
  toggleButton:
    'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white',
} as const;
