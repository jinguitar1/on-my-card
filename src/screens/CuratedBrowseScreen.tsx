import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { suggestionsByCategory, type TileIdea } from '../domain/tileBank';
import { CAPACITY, CATEGORY_LABELS } from '../domain/types';
import { lightTap, stampHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { PrimaryButton, ProgressBar } from '../ui/components';
import { categoryColor, colors, radius, space } from '../ui/theme';

/** The "Curated ideas" path in CreateCardScreen — replaces the old swipe-left/skip,
 *  swipe-right/keep deck with a single scrollable catalog, grouped by category like
 *  SuggestionPicker's own browse view, so filling a card reads as "shopping for ideas
 *  and adding them to your cart" rather than a one-at-a-time swipe decision. Every idea
 *  stays visible and in place the whole time (nothing disappears once added, the way a
 *  swiped-left card would) — tapping an added one again removes it, so the full catalog
 *  always doubles as a review of what's in the cart. */
export default function CuratedBrowseScreen({
  initialKept = [],
  onProgress,
  onDone,
}: {
  initialKept?: TileIdea[];
  onProgress?: (kept: TileIdea[]) => void;
  onDone: (kept: TileIdea[]) => void;
}) {
  const sound = useSound();
  const [kept, setKept] = useState<TileIdea[]>(initialKept);
  const keptIds = useMemo(() => new Set(kept.map((t) => t.id)), [kept]);
  // The whole bank, not filtered by what's kept — an added idea stays in its place in
  // the list (marked "Added") rather than vanishing, so scrolling back up is itself the
  // way to review the cart; no separate kept-list panel needed.
  const groups = useMemo(() => suggestionsByCategory(new Set()), []);

  useEffect(() => {
    onProgress?.(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept]);

  const toggle = (idea: TileIdea) => {
    if (keptIds.has(idea.id)) {
      setKept((k) => k.filter((t) => t.id !== idea.id));
      lightTap();
      return;
    }
    if (kept.length >= CAPACITY) return;
    const next = [...kept, idea];
    setKept(next);
    stampHit();
    sound.play('stamp');
    if (next.length >= CAPACITY) onDone(next);
  };

  const progressPct = Math.min(100, (kept.length / CAPACITY) * 100);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.progressRow}>
        <ProgressBar pct={progressPct} color={colors.accentClay} height={6} />
        <Text style={styles.progressHint}>
          Tap an idea to add it to your card · {kept.length}/{CAPACITY} added
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group.category} style={{ marginBottom: space.lg }}>
            <Text style={styles.categoryHeader}>{CATEGORY_LABELS[group.category]}</Text>
            <View style={{ gap: space.sm }}>
              {group.items.map((idea) => {
                const added = keptIds.has(idea.id);
                return (
                  <Pressable
                    key={idea.id}
                    onPress={() => toggle(idea)}
                    style={[styles.item, { borderColor: categoryColor(idea.category) }, added && styles.itemAdded]}
                  >
                    <Text style={styles.itemEmoji}>{idea.emoji}</Text>
                    <Text style={[styles.itemLabel, added && styles.itemLabelAdded]} numberOfLines={2}>
                      {idea.label}
                    </Text>
                    <Text style={[styles.itemAction, added && styles.itemActionAdded]}>{added ? '✓ Added' : '+ Add'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* A solid, heightened PrimaryButton now, not a plain-text GhostButton — the finish
          action used to read as easy to miss (no fill, no real height) sitting right at
          the bottom of the screen. */}
      {kept.length > 0 && (
        <View style={styles.footer}>
          <PrimaryButton
            label={`Finish With ${kept.length} Tile${kept.length === 1 ? '' : 's'}`}
            tone="clay"
            onPress={() => onDone(kept)}
            style={styles.finishBtn}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progressRow: { paddingHorizontal: space.lg, marginBottom: space.sm },
  progressHint: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: colors.inkQuietFaint, textAlign: 'center', marginTop: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.md },
  categoryHeader: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.inkQuietFaint,
    marginBottom: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: space.md,
  },
  itemAdded: { backgroundColor: colors.accentClaySoft },
  itemEmoji: { fontSize: 20 },
  itemLabel: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  itemLabelAdded: { color: colors.inkSoft },
  itemAction: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.inkQuietFaint },
  itemActionAdded: { color: colors.accentClay },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.lineQuiet, backgroundColor: colors.paperQuiet },
  finishBtn: { paddingVertical: 18 },
});
