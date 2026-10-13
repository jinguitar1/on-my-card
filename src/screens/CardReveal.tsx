import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TileIdea } from '../domain/tileBank';
import { collapseDictationDuplicate } from '../domain/dictation';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { triumphHit } from '../feedback/haptics';
import { Companion } from '../ui/Companion';
import { CardTile, PrimaryButton, cardLayout } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/** The finished-card reveal moment — the swiped-through tiles stamp in with confetti,
 *  then the user names the card right there before it's saved. Shared by first-run
 *  onboarding and the in-app "create a new card" flow, which only differ in what
 *  happens once the name is confirmed (`onSave`) and the button's wording (`ctaLabel`).
 *  No emoji field here anymore — a card's emoji is still a real, editable field
 *  (CardDetailScreen's tap-to-edit), just no longer something to decide at the exact
 *  moment of creation; this screen is about naming the card and nothing else. */
export function CardReveal({
  kept,
  defaultTitle,
  ctaLabel,
  onSave,
  onAddMore,
}: {
  kept: TileIdea[];
  defaultTitle: string;
  ctaLabel: string;
  onSave: (title: string) => void;
  /** Lets a card finished with fewer than 24 tiles go back and add more before saving —
   *  only CreateCardScreen passes this (it just flips its own phase back to 'deck',
   *  resuming exactly where it left off since the deck screens already seed from
   *  `draft.kept`); omitted here, every empty "+" cell stays the inert placeholder it
   *  always was. Onboarding's own call site doesn't pass it, since its deck always
   *  either fills all 24 or runs the bank dry trying. */
  onAddMore?: () => void;
}) {
  const { width } = useWindowDimensions();
  const gridW = Math.min(width - space.lg * 2, 420);
  const layout = useMemo(() => cardLayout(gridW), [gridW]);
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    triumphHit();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      {/* The grid (up to 420px tall) + headline + companion row + name field never fit a
          real phone screen at once, let alone once the keyboard takes another third of
          it — this used to be a fixed, non-scrolling column, so the keyboard opening just
          force-squeezed everything with nowhere for the overflow to go, cutting the top
          of the card off-screen. A ScrollView gives it somewhere to go; the CTA stays
          outside it (below, fixed) so it's never what scrolls out of reach. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.revealWrap}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.revealHeadline}>Your card is ready.</Text>
        <View style={[styles.gridWrap, { width: gridW, height: gridW }]}>
          {Array.from({ length: CELL_COUNT }).map((_, cell) => {
            const r = Math.floor(cell / GRID);
            const c = cell % GRID;
            const stylePos = { position: 'absolute' as const, left: layout.pos(c), top: layout.pos(r) };
            if (cell === CENTER) {
              return (
                <View key={cell} style={stylePos}>
                  <CardTile isCenter size={layout.cell} />
                </View>
              );
            }
            const idea = kept[cell < CENTER ? cell : cell - 1];
            return (
              <View key={cell} style={stylePos}>
                <CardTile
                  size={layout.cell}
                  label={idea?.label ?? '＋'}
                  emoji={idea?.emoji}
                  onPress={!idea && onAddMore ? onAddMore : undefined}
                />
              </View>
            );
          })}
        </View>
        <Confetti trigger={1} intensity="full" accent={colors.accentClay} />

        {/* Introduced right here, not on first open of Today — the card's actual birth
            moment is the natural place to meet it, so Today isn't a stranger's screen the
            first time it's seen. Every new card starts at stage 0, always — no Card object
            exists yet to derive a real stage from, and a brand-new card has 0 bingos by
            definition regardless. */}
        <View style={styles.companionRow}>
          <Companion stage={0} size={56} />
          <Text style={styles.companionLine}>Say hello. It'll grow as you cross tiles off.</Text>
        </View>

        <Text style={styles.nameLabel}>Name your card</Text>
        {/* `defaultValue`, not `value` — avoids the iOS-dictation duplicate-text bug a
            controlled TextInput causes; `onChangeText` still keeps `title` in sync for
            the Save button's disabled check and for what actually gets saved. */}
        <TextInput
          defaultValue={title}
          onChangeText={(t) => setTitle(collapseDictationDuplicate(t))}
          placeholder="Name your card"
          placeholderTextColor={colors.inkFaint}
          style={styles.nameInput}
          autoFocus
          selectTextOnFocus
        />
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={ctaLabel} onPress={() => onSave(title)} disabled={!title.trim()} style={{ flex: 1 }} />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  footer: { padding: space.lg, flexDirection: 'row' },
  revealWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  revealHeadline: { ...type.quietDisplay, fontSize: 28, textAlign: 'center', marginBottom: space.xl },
  gridWrap: { position: 'relative' },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    marginTop: space.xl,
    backgroundColor: colors.accentClaySoft,
    borderRadius: 14,
    padding: space.sm,
  },
  companionLine: { ...type.quietQuote, flex: 1, fontSize: 13, lineHeight: 18 },
  nameLabel: { ...type.quietLabel, marginTop: space.lg, marginBottom: space.xs },
  nameInput: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
    color: colors.ink,
    textAlign: 'center',
  },
});
