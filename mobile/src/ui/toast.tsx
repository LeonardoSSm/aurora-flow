import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Txt } from './primitives';
import { radii, shadow, spacing } from './theme';

type ToastVariant = 'success' | 'error' | 'info';
type ToastInput = { title: string; description?: string; variant?: ToastVariant };
type ToastState = ToastInput & { id: number };

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

/** Aviso curto no rodapé (salvo, enviado, erro) — no lugar dos Alert que travavam a tela. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (input: ToastInput) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...input, id: Date.now() });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(
        () => {
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
        },
        input.variant === 'error' ? 4500 : 2600,
      );
    },
    [opacity],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => show, [show]);
  const variant = toast?.variant ?? 'success';
  const palette =
    variant === 'error'
      ? { bg: '#3B0A0A', icon: 'alert-triangle' as const, fg: '#FECACA' }
      : variant === 'info'
        ? { bg: '#0F1D3D', icon: 'info' as const, fg: '#BFDBFE' }
        : { bg: '#0B2A17', icon: 'check-circle' as const, fg: '#BBF7D0' };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { bottom: insets.bottom + 84, opacity }]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.toast, { backgroundColor: palette.bg }]}>
            <Icon name={palette.icon} size={18} color={palette.fg} />
            <View style={{ flex: 1 }}>
              <Txt variant="smallStrong" color="#fff">
                {toast.title}
              </Txt>
              {toast.description ? (
                <Txt variant="caption" color="#E2E8F0">
                  {toast.description}
                </Txt>
              ) : null}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.raised,
  },
});
