import Constants from 'expo-constants';
import { setStatusBarStyle } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/auth-context';
import { FieldShell, Input } from '../ui/inputs';
import { Button, IconButton, Notice, Txt } from '../ui/primitives';
import { makeStyles, radii, shadow, spacing, useTheme } from '../ui/theme';
import { baseStatusBarStyle } from '../ui/theme-provider';

const logo = require('../../assets/splash-icon.png') as number;

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  useEffect(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle(baseStatusBarStyle(isDark));
  }, [isDark]);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Informe o e-mail e a senha.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? 'E-mail ou senha incorretos.'
          : status === 429
            ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
            : apiErrorMessage(err, 'Não foi possível entrar. Tente de novo.'),
      );
    } finally {
      setLoading(false);
    }
  }

  const version = Constants.expoConfig?.version ?? '';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Txt variant="display" color={colors.onBrand}>
            Gestão de Processos
          </Txt>
          <Txt variant="body" color="rgba(255,255,255,0.8)">
            Solicitações, fases e aprovações na palma da mão.
          </Txt>
        </View>

        <View style={styles.card}>
          <Image
            source={logo}
            style={[styles.logo, isDark && { tintColor: colors.text }]}
            resizeMode="contain"
            accessibilityLabel="Tijuca Alimentos"
          />
          {error ? <Notice tone="danger" icon="alert-circle" text={error} /> : null}
          <FieldShell label="E-mail">
            <Input
              icon="mail"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@tijucaalimentos.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!loading}
            />
          </FieldShell>
          <FieldShell label="Senha">
            <Input
              ref={passwordRef}
              icon="lock"
              value={password}
              onChangeText={setPassword}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              editable={!loading}
              trailing={
                <IconButton
                  name={showPassword ? 'eye-off' : 'eye'}
                  label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  size={18}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
            />
          </FieldShell>
          <Button label="Entrar" size="lg" onPress={() => void submit()} loading={loading} iconRight="arrow-right" />
          <Txt variant="caption" color={colors.textMuted} align="center">
            Esqueceu a senha? Peça ao administrador do sistema ou use o portal web.
          </Txt>
        </View>

        <Txt variant="caption" color="rgba(255,255,255,0.6)" align="center">
          Tijuca Flow {version}
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.hero },
    content: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.xl, justifyContent: 'center' },
    hero: { gap: spacing.xs, paddingHorizontal: spacing.xs },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      padding: spacing.xl,
      gap: spacing.lg,
      ...shadow.raised,
    },
    logo: { width: 150, height: 96, alignSelf: 'center' },
  }),
);
