import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { API_BASE_URL } from '../config/environment';
import { useAuth } from '../context/auth-context';
import { roleLabel } from '../domain/format';
import { Segmented } from '../ui/inputs';
import { Screen, ScreenHeader, ScreenScroll } from '../ui/layout';
import { Avatar, Button, Card, InfoRow, SectionHeader, Txt } from '../ui/primitives';
import { spacing, type ThemeMode, useTheme } from '../ui/theme';

const THEME_OPTIONS = [
  { value: 'system', label: 'Automático', icon: 'smartphone' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Escuro', icon: 'moon' },
] as const satisfies ReadonlyArray<{ value: ThemeMode; label: string; icon: 'smartphone' | 'sun' | 'moon' }>;

/** Quem está logado, versão do app e sair. Senha e cadastro ficam no portal web. */
export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  function confirmLogout() {
    Alert.alert('Sair do app?', 'Você vai precisar do e-mail e da senha para entrar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          await logout();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader back title="Meu perfil" />
      <ScreenScroll>
        <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }}>
          <Avatar name={user?.fullName} size={72} />
          <Txt variant="title" align="center">
            {user?.fullName}
          </Txt>
          <Txt variant="small" color={colors.textMuted} selectable>
            {user?.email}
          </Txt>
        </Card>

        <SectionHeader title="Conta" />
        <Card style={{ paddingVertical: spacing.xs }}>
          <InfoRow label="Perfil" icon="shield" value={roleLabel(user?.role)} />
          <InfoRow label="Senha" icon="key" value="Troque pelo portal web" last />
        </Card>

        <SectionHeader title="Aparência" />
        <Segmented items={THEME_OPTIONS} value={mode} onChange={setMode} />
        <Txt variant="caption" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {mode === 'system' ? 'Segue o modo escuro do celular.' : mode === 'dark' ? 'Tema escuro sempre ligado.' : 'Tema claro sempre ligado.'}
        </Txt>

        <SectionHeader title="Aplicativo" />
        <Card style={{ paddingVertical: spacing.xs }}>
          <InfoRow label="Versão" icon="smartphone" value={`${Constants.expoConfig?.version ?? '—'}`} />
          <InfoRow label="Servidor" icon="server" value={API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api\/v\d+$/, '')} last />
        </Card>

        <View style={{ marginTop: spacing.xxl }}>
          <Button label="Sair" icon="log-out" variant="dangerOutline" loading={leaving} onPress={confirmLogout} />
        </View>
      </ScreenScroll>
    </Screen>
  );
}
