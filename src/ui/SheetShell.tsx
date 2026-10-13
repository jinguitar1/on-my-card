import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

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
  // Explicit pixel sizing via `useWindowDimensions()`, not `flex: 1` + percentages, for
  // both `root` and `sheet` — a prior fix (flattening a redundant auto-height wrapper)
  // addressed one real cause of this sheet rendering blank on-device, but it persisted
  // after that fix shipped, which means `flex: 1` resolving a *definite* height from a
  // `transparentModal`'s own native container isn't something to keep assuming here at
  // all. Window dimensions sidestep the question entirely: `root` gets a real, known
  // pixel height no matter how react-native-screens sizes the transparent modal's
  // content view, and `sheet`'s `maxHeight` is computed from that same real number
  // rather than a `'85%'` string needing a resolved parent to mean anything.
  const { height: screenHeight } = useWindowDimensions();

  return (
    <View style={[styles.root, { height: screenHeight }]}>
      <Pressable style={[styles.backdrop, dim && styles.backdropDim]} onPress={onClose} />
      <KeyboardAvoidingView
        style={[styles.sheet, { maxHeight: screenHeight * 0.85 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  backdropDim: { backgroundColor: 'rgba(30, 27, 22, 0.45)' },
  sheet: {
    backgroundColor: colors.paperQuiet,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  content: { padding: space.lg, paddingBottom: space.xxl },
});
