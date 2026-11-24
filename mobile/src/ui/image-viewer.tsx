import React from 'react';
import { Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Txt } from './primitives';
import { spacing } from './theme';

/** Foto em tela cheia (anexo, etiqueta): fecha no X ou no voltar; compartilhar abre o menu do Android. */
export function ImageViewer({
  uri,
  title,
  onClose,
  onShare,
}: {
  uri: string | null;
  title?: string;
  onClose: () => void;
  onShare?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={uri !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        {uri ? <Image source={{ uri }} style={{ width, height }} resizeMode="contain" accessibilityLabel={title} /> : null}
        <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
          <IconButton name="x" label="Fechar" color="#fff" onPress={onClose} />
          <Txt variant="smallStrong" color="#fff" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Txt>
          {onShare ? <IconButton name="share-2" label="Compartilhar" color="#fff" onPress={onShare} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
