/**
 * Harness de desenvolvimento da sidebar — `sidebar-preview.html` na raiz do
 * frontend. Monta a SidebarNav real (aberta e recolhida) sem backend e sem
 * login, para iterar no design da barra sem subir a stack inteira.
 *
 * Nao entra no build: o unico entry de `vite build` e o index.html.
 * Rode com `npm --prefix frontend run dev` e abra /sidebar-preview.html.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../app/auth-context';
import { brand } from '../brand';
import { ToastProvider } from '../components/ui';
import { queryClient } from '../lib/query-client';
import { SidebarNav } from '../modules/layout/components/sidebar-nav';
import '../styles/global.css';

function hexToChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

const root = document.documentElement;
root.style.setProperty('--color-primary', brand.colors.primary);
root.style.setProperty('--color-primary-dark', brand.colors.primaryDark);
root.style.setProperty('--color-secondary', brand.colors.secondary);
root.style.setProperty('--color-accent', brand.colors.accent);
root.style.setProperty('--color-primary-ch', hexToChannels(brand.colors.primary));
root.style.setProperty('--color-primary-dark-ch', hexToChannels(brand.colors.primaryDark));
root.style.setProperty('--color-secondary-ch', hexToChannels(brand.colors.secondary));
root.style.setProperty('--color-accent-ch', hexToChannels(brand.colors.accent));
root.style.setProperty('--font-heading', brand.fonts.heading);
root.style.setProperty('--font-body', brand.fonts.body);

const noop = () => {};

function Stage({ label, isOpen }: { label: string; isOpen: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-tx-muted">
        {label}
      </span>
      {/* A aside real e `md:h-screen`; aqui ela e limitada a altura do palco. */}
      <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border-default [&_aside]:!h-full">
        <MemoryRouter initialEntries={['/inicio']}>
          <SidebarNav
            isOpen={isOpen}
            onCreateForm={noop}
            onLogout={noop}
            onToggleCollapse={noop}
            onToggleTheme={noop}
            isDark={false}
            isMobileOpen
            onCloseMobile={noop}
            userName="Leonardo Silva"
            userEmail="leonardo.silva@tijucaalimentos.com.br"
          />
        </MemoryRouter>
      </div>
    </div>
  );
}

function SidebarPreview() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <div className="flex min-h-screen items-start gap-8 bg-bg-base p-8">
            <Stage label="Aberta" isOpen />
            <Stage label="Recolhida" isOpen={false} />
          </div>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

declare global {
  interface Window {
    __sidebarPreviewRoot?: ReactDOM.Root;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
// Reaproveita a root entre execucoes do HMR — sem isso cada edicao no design da
// barra loga um aviso de createRoot duplicado.
const previewRoot = window.__sidebarPreviewRoot ?? ReactDOM.createRoot(container);
window.__sidebarPreviewRoot = previewRoot;
previewRoot.render(<SidebarPreview />);
