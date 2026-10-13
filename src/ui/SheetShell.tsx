import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, space } from './theme';

/** The shared bottom-sheet-over-a-dimmed-backdrop shell for TileSheetScreen and
 *  TileEditScreen — the screen behind stays visible through it (a `transparentModal`
 *  presentation, set on the route in RootNavigator.tsx, keeps it mounted), which is the
 *  whole point: the grid should feel present underneath, not replaced by a new page.
 *
 *  `dim`: only the FIRST sheet over the grid should paint a visible scrim. When a second
 *  sheet is pushed on top of this one (TileEdit over TileSheet), the grid is already
 *  dimmed by the one still-mounted underneath — a second dim would double-darken it. The
 *  backdrop stays tappable-to-dismiss either way, just transparent when `dim` is false. */
export function SheetShell({ children, onClose, dim = true }: { children: ReactNode; onClose: () => void; dim?: boolean }) {
  return (
    <View style={styles.root}>
      <Pressable style={[styles.backdrop, dim && styles.backdropDim]} onPress={onClose} />
      <View style={styles.sheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  backdropDim: { backgroundColor: 'rgba(30, 27, 22, 0.45)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.paperQuiet,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  content: { padding: space.lg, paddingBottom: space.xxl },
});
