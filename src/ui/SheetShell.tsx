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
  // Explicit pixel sizing via `useWindowDimensions()` for `root`, so it always gets a
  // real, known full-screen height no matter how react-native-screens sizes a
  // `transparentModal`'s content view.
  //
  // `sheet` itself was the actual, still-unfixed bug through two prior attempts at this:
  // it only ever had a `maxHeight` (a *cap* on content-driven sizing), never a `height`
  // or `flex`. That's fine on its own — a `maxHeight`-only View is supposed to shrink-
  // wrap its content, up to that cap. But its child, the ScrollView below, had its own
  // `flex: 1`, meaning "fill 100% of my parent's height" — and the parent's height was
  // *itself* defined as "whatever my content needs." That's the same circular
  // flex-in-an-auto-height-parent ambiguity the very first fix here addressed in a
  // *different* pair of views, reappearing one level deeper in this exact pair, which
  // is why removing that outer wrapper (and later, switching the cap from a `'85%'`
  // string to a literal pixel number) never actually resolved it — neither change
  // touched the real circular dependency. The fix is to stop asking the ScrollView to
  // fill a height that doesn't exist yet: no `flex: 1` here, so it sizes to its own
  // content first, which `sheet`'s `maxHeight` (plus `overflow: 'hidden'`) then clips
  // and makes scrollable, the same way `maxHeight`-capped scrollable panels are meant to
  // work.
  const { height: screenHeight } = useWindowDimensions();

  return (
    <View style={[styles.root, { height: screenHeight }]}>
      <Pressable style={[styles.backdrop, dim && styles.backdropDim]} onPress={onClose} />
      <KeyboardAvoidingView
        style={[styles.sheet, { maxHeight: screenHeight * 0.85 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
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
