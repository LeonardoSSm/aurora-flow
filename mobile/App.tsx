import { NavigationContainer, createNavigationContainerRef, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerPushToken } from './src/api/endpoints';
import { AuthProvider, useAuth } from './src/context/auth-context';
import RootNavigator from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';
import { useTheme } from './src/ui/theme';
import { ThemeProvider } from './src/ui/theme-provider';
import { ToastProvider } from './src/ui/toast';
import { registerForPushNotificationsAsync } from './src/utils/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 20_000, refetchOnWindowFocus: true },
  },
});

// Voltar ao app atualiza as telas abertas (o "foco" do React Query vem do AppState no celular).
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

const navigationRef = createNavigationContainerRef<RootStackParamList>();

type PushData = { type?: string; approvalId?: string; solicitationId?: string };

function openFromPush(data: PushData) {
  if (!navigationRef.isReady()) return;
  if (data.approvalId) navigationRef.navigate('ApprovalLink', { approvalId: data.approvalId });
  else if (data.solicitationId) navigationRef.navigate('Card', { solicitationId: data.solicitationId });
  else navigationRef.navigate('Tabs', { screen: 'Inbox' });
}

function AppInner() {
  const { isAuthenticated } = useAuth();
  const pendingPush = useRef<PushData | null>(null);
  const { colors, isDark } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        primary: colors.brand,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, isDark]);

  // Token de push depois do login (falhar aqui não pode travar o app).
  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (!token) return;
      try {
        await registerPushToken({ token, platform: Platform.OS as 'ios' | 'android' });
      } catch {
        // não crítico
      }
    })();
  }, [isAuthenticated]);

  // Toque na notificação: abre o card ou a aprovação (espera o login, se preciso).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushData;
      if (isAuthenticated) openFromPush(data);
      else pendingPush.current = data;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && pendingPush.current) {
      const data = pendingPush.current;
      pendingPush.current = null;
      setTimeout(() => openFromPush(data), 300);
    }
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <AuthProvider>
                <AppInner />
              </AuthProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
