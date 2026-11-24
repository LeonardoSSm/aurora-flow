import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

/**
 * Ponte entre o modal de Administracao e as views dentro dele.
 *
 * Titulo, kicker e descricao de cada secao saem de `adminSectionHeader()`
 * (constants.ts). Uma view so chama `useAdminHeader` quando precisa de texto
 * dinamico (ex.: "12 usuario(s) no sistema"). Botoes de acao e o rodape de
 * Configuracoes entram por portal nos slots do modal, assim continuam na arvore
 * React da propria view (estado e handlers locais) mas aparecem no cabecalho ou
 * fora da area de rolagem. Um painel que substitui a secao inteira (ex.: convidar
 * usuario) entra pelo overlay, que cobre cabecalho + corpo.
 */
export type AdminHeader = {
  kicker?: string;
  title: string;
  description?: string;
};

type AdminModalContextValue = {
  /** Container de rolagem do corpo do modal (ancoras da documentacao rolam nele). */
  scrollRef: RefObject<HTMLDivElement>;
  setHeaderOverride: (path: string, header: Partial<AdminHeader> | null) => void;
  actionsSlot: HTMLElement | null;
  footerSlot: HTMLElement | null;
  /** Camada sobre cabecalho + corpo da coluna direita (ver AdminModalOverlay). */
  overlaySlot: HTMLElement | null;
  /** Com o overlay aberto, cabecalho + corpo saem para a esquerda e ficam inertes. */
  setOverlayOpen: (open: boolean) => void;
  /** Pilha de handlers de Esc da secao (ver useAdminEscape). */
  escapeHandlers: MutableRefObject<Array<{ current: () => void }>>;
};

export const AdminModalContext = createContext<AdminModalContextValue | null>(null);

export function useAdminModal() {
  return useContext(AdminModalContext);
}

/** Sobrescreve partes do cabecalho do modal enquanto a view estiver montada. */
export function useAdminHeader({ kicker, title, description }: Partial<AdminHeader>) {
  const modal = useAdminModal();
  const setHeaderOverride = modal?.setHeaderOverride;
  const { pathname } = useLocation();

  useEffect(() => {
    if (!setHeaderOverride) return;
    const header: Partial<AdminHeader> = {};
    if (kicker !== undefined) header.kicker = kicker;
    if (title !== undefined) header.title = title;
    if (description !== undefined) header.description = description;
    setHeaderOverride(pathname, header);
    return () => setHeaderOverride(pathname, null);
  }, [setHeaderOverride, pathname, kicker, title, description]);
}

/**
 * Esc da propria secao (ex.: limpar a selecao do Mapa de servicos). Enquanto
 * `enabled`, o Esc do modal chama `handler` em vez de fechar — depois do modal
 * interno e da busca, antes de fechar o modal.
 */
export function useAdminEscape(handler: () => void, enabled: boolean) {
  const stack = useAdminModal()?.escapeHandlers;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !stack) return;
    const entry = { current: () => handlerRef.current() };
    stack.current.push(entry);
    return () => {
      const index = stack.current.indexOf(entry);
      if (index >= 0) stack.current.splice(index, 1);
    };
  }, [enabled, stack]);
}

/** Acoes da secao, exibidas a direita do titulo no cabecalho do modal. */
export function AdminHeaderActions({ children }: { children: ReactNode }) {
  const modal = useAdminModal();
  if (!modal) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  if (!modal.actionsSlot) return null;
  return createPortal(children, modal.actionsSlot);
}

/** Rodape fixo do modal, fora da area de rolagem (hoje so Configuracoes usa). */
export function AdminModalFooter({ children }: { children: ReactNode }) {
  const modal = useAdminModal();
  if (!modal) return <>{children}</>;
  if (!modal.footerSlot) return null;
  return createPortal(children, modal.footerSlot);
}

/**
 * Painel que cobre cabecalho + corpo da coluna direita do modal (a side-nav fica
 * visivel). Enquanto `open`, o modal desliza cabecalho + corpo para a esquerda e
 * os deixa inertes; o proprio painel cuida da sua entrada/saida. Os filhos ficam
 * montados durante a animacao de saida: quem chama decide quando desmontar.
 */
export function AdminModalOverlay({ open, children }: { open: boolean; children: ReactNode }) {
  const modal = useAdminModal();
  const setOverlayOpen = modal?.setOverlayOpen;

  useEffect(() => {
    setOverlayOpen?.(open);
  }, [setOverlayOpen, open]);

  useEffect(() => {
    if (!setOverlayOpen) return;
    return () => setOverlayOpen(false);
  }, [setOverlayOpen]);

  if (!modal) return open ? <>{children}</> : null;
  if (!modal.overlaySlot) return null;
  return createPortal(children, modal.overlaySlot);
}

/** `inert` pelo DOM: o React 18 nao trata o atributo como booleano. */
export function useInert(ref: RefObject<HTMLElement>, inert: boolean) {
  useEffect(() => {
    ref.current?.toggleAttribute('inert', inert);
  }, [ref, inert]);
}
