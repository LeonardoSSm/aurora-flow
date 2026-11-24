import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/auth-context';
import { router } from './app/router';
import { brand } from './brand';
import type { BrandConfig } from './brand';
import { ToastProvider } from './components/ui';
import { queryClient } from './lib/query-client';
import './styles/global.css';

function hexToChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

function applyBrandTheme(config: BrandConfig) {
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set('--color-primary', config.colors.primary);
  set('--color-primary-dark', config.colors.primaryDark);
  set('--color-primary-light', config.colors.primaryLight);
  set('--color-secondary', config.colors.secondary);
  set('--color-accent', config.colors.accent);
  set('--color-text', config.colors.text);
  set('--color-text-muted', config.colors.textMuted);
  set('--color-surface', config.colors.surface);
  set('--color-background', config.colors.background);
  set('--color-border', config.colors.border);
  set('--color-danger', config.colors.danger);
  set('--color-success', config.colors.success);
  set('--color-warning', config.colors.warning);

  // RGB channels for Tailwind opacity modifier support (e.g. bg-primary/30)
  set('--color-primary-ch', hexToChannels(config.colors.primary));
  set('--color-primary-dark-ch', hexToChannels(config.colors.primaryDark));
  set('--color-primary-light-ch', hexToChannels(config.colors.primaryLight));
  set('--color-secondary-ch', hexToChannels(config.colors.secondary));
  set('--color-accent-ch', hexToChannels(config.colors.accent));

  set('--font-heading', config.fonts.heading);
  set('--font-body', config.fonts.body);

  if (config.backgrounds.auth) set('--bg-auth', `url('${config.backgrounds.auth}')`);
  if (config.backgrounds.authPattern)
    set('--bg-auth-pattern', `url('${config.backgrounds.authPattern}')`);
  if (config.backgrounds.patternLight)
    set('--bg-pattern-light', `url('${config.backgrounds.patternLight}')`);
}

applyBrandTheme(brand);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>,
);
