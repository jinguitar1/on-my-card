import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TileIdea } from '../domain/tileBank';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { triumphHit } from '../feedback/haptics';
import { CardTile, PrimaryButton, cardLayout } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/** The finished-card reveal moment — the swiped-through tiles stamp in with confetti,
 *  then the user names the card right there before it's saved. Shared by first-run
 *  onboarding and the in-app "create a new card" flow, which only differ in what
 *  happens once the name is confirmed (`onSave`) and the button's wording (`ctaLabel`). */
export function CardReveal({
  kept,
  defaultTitle,
  ctaLabel,
  onSave,
}: {
  kept: TileIdea[];
  defaultTitle: string;
  ctaLabel: string;
  onSave: (title: string, emoji: string) => void;
}) {
  const { width } = useWindowDimensions();
  const gridW = Math.min(width - space.lg * 2, 420);
  const layout = useMemo(() => cardLayout(gridW), [gridW]);
  const [title, setTitle] = useState(defaultTitle);
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    triumphHit();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.revealWrap}>
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
                <CardTile size={layout.cell} label={idea?.label ?? '＋'} emoji={idea?.emoji} />
              </View>
            );
          })}
        </View>
        <Confetti trigger={1} intensity="full" accent={colors.stampGold} />

        <Text style={styles.nameLabel}>Name your card</Text>
        <View style={styles.nameRow}>
          <TextInput
            value={emoji}
            onChangeText={setEmoji}
            placeholder="🙂"
            placeholderTextColor={colors.inkFaint}
            style={styles.emojiInput}
          />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Name your card"
            placeholderTextColor={colors.inkFaint}
            style={[styles.nameInput, { flex: 1 }]}
            autoFocus
            selectTextOnFocus
          />
        </View>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label={ctaLabel} onPress={() => onSave(title, emoji)} disabled={!title.trim()} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  footer: { padding: space.lg, flexDirection: 'row' },
  revealWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  revealHeadline: { ...type.display, textAlign: 'center', marginBottom: space.xl },
  gridWrap: { position: 'relative' },
  nameLabel: { ...type.kicker, marginTop: space.xl, marginBottom: space.xs },
  nameRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  emojiInput: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 24,
    textAlign: 'center',
    padding: 0,
  },
  nameInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
});
