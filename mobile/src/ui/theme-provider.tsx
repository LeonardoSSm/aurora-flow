import { setStatusBarStyle } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { darkTheme, lightTheme, ThemeContext, type Theme, type ThemeMode } from './theme';

const STORAGE_KEY = 'tijuca_flow_theme_mode';

function isMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Ícones da barra de status que combinam com o fundo das telas comuns do tema atual. */
export function baseStatusBarStyle(isDark: boolean) {
  return isDark ? 'light' : 'dark';
}

/**
 * Tema do app: segue o modo escuro do celular, a não ser que a pessoa escolha claro ou escuro no
 * Perfil (a escolha fica guardada no aparelho). A escolha também vai para o Android, para os
 * diálogos nativos (calendário, relógio, alertas) seguirem o mesmo tema.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (isMode(saved)) setModeState(saved);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? null : mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  // A escolha da pessoa vale antes do que o sistema informa (que pode ainda refletir a anterior).
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');

  useEffect(() => {
    setStatusBarStyle(baseStatusBarStyle(isDark));
  }, [isDark]);

  const value = useMemo<Theme>(() => ({ ...(isDark ? darkTheme : lightTheme), mode, setMode }), [isDark, mode, setMode]);

  // Lê a preferência antes de desenhar, para não piscar o tema errado ao abrir.
  if (!ready) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
