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
      {/* The sheet itself IS the KeyboardAvoidingView (not a plain View wrapping one with
          its own `flex: 1`) — that extra nesting is what broke this on-device: `sheet`'s
          height was only ever bounded by `maxHeight`, a content-driven ("auto") size, so
          a `flex: 1` child demanding "fill 100% of my parent" inside it was circular —
          Yoga (native) resolves that ambiguity by collapsing the child to zero height,
          while a browser's flexbox engine (the only place this was ever tested) is more
          forgiving about it and renders fine anyway. The result on a real phone: the dim
          backdrop painted correctly, but the sheet's content silently rendered at zero
          height — "a gray screen pops up and nothing else shows up." Putting `maxHeight`
          directly on the KeyboardAvoidingView removes the extra auto-height parent, so
          the ScrollView's own `flex: 1` below has an unambiguous, resolved height to
          fill instead of a circular one. */}
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
