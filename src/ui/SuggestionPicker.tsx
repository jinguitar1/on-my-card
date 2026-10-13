import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { suggestionsByCategory } from '../domain/tileBank';
import { CATEGORY_LABELS, type TileCategory } from '../domain/types';
import { GhostButton, PrimaryButton } from './components';
import { categoryColor, colors, radius, space } from './theme';

/** Structurally the same shape as AppStateContext's `TileSeed` (deliberately not
 *  imported from there — `ui/` stays independent of `state/`), so a caller can hand the
 *  result straight to `setTile`/`setTilePlan`-adjacent actions without conversion. */
export interface PickedSeed {
  label: string;
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
}

type Mode = 'choose' | 'curated' | 'custom';

/** The whole "pick something for this square" interaction, shared between
 *  TileSheetScreen's empty-cell fill and TileEditScreen's "Swap for a different idea".
 *  Leads with a choice (type your own vs. curated presets) rather than dumping both
 *  paths — plus, formerly, an AI-research option — on screen at once; AI research is
 *  removed entirely here (on hold for v1 — see CreateCardScreen's own note on the same
 *  decision), not just reordered behind the choice. Purely presentational: picking
 *  anything just calls `onPicked`, the caller decides what happens next (write the
 *  tile, navigate, etc.). */
export function SuggestionPicker({
  usedBankIds,
  onPicked,
}: {
  usedBankIds: Set<string>;
  onPicked: (seed: PickedSeed) => void;
}) {
  const categorized = useMemo(() => suggestionsByCategory(usedBankIds), [usedBankIds]);
  const [mode, setMode] = useState<Mode>('choose');
  const [typedLabel, setTypedLabel] = useState('');

  const pick = (s: { id: string; emoji: string; label: string; note: string; category?: TileCategory }) => {
    onPicked({ label: s.label, emoji: s.emoji, note: s.note, category: s.category, bankId: s.id });
  };
  const saveTyped = () => {
    if (!typedLabel.trim()) return;
    onPicked({ label: typedLabel.trim() });
  };

  if (mode === 'choose') {
    return (
      <View style={{ gap: space.sm }}>
        <Pressable style={styles.choice} onPress={() => setMode('custom')}>
          <Text style={styles.choiceEmoji}>✍️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Type your own</Text>
            <Text style={styles.choiceSub}>Write exactly what you want on this square.</Text>
          </View>
        </Pressable>
        <Pressable style={styles.choice} onPress={() => setMode('curated')}>
          <Text style={styles.choiceEmoji}>🎲</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Curated presets</Text>
            <Text style={styles.choiceSub}>Pick from pre-written ideas.</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  if (mode === 'custom') {
    return (
      <View>
        <TextInput
          value={typedLabel}
          onChangeText={setTypedLabel}
          placeholder="Type it here"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          autoFocus
        />
        <PrimaryButton label="Add it" onPress={saveTyped} disabled={!typedLabel.trim()} style={{ marginTop: space.sm }} />
        <GhostButton label="← Back" onPress={() => setMode('choose')} style={{ marginTop: space.sm }} />
      </View>
    );
  }

  // Every remaining idea, not a small sample — grouped by category so a long list (up
  // to ~80 minus whatever's already on the card) is still scannable, and left to the
  // enclosing SheetShell's own ScrollView to actually scroll (this view has no scroll
  // container of its own).
  return (
    <View>
      {categorized.map((group) => (
        <View key={group.category} style={{ marginBottom: space.lg }}>
          <Text style={styles.categoryHeader}>{CATEGORY_LABELS[group.category]}</Text>
          <View style={{ gap: space.sm }}>
            {group.items.map((s) => (
              <Pressable key={s.id} onPress={() => pick(s)} style={[styles.suggestion, { borderColor: categoryColor(s.category) }]}>
                <Text style={styles.suggestionEmoji}>{s.emoji}</Text>
                <Text style={styles.suggestionLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <GhostButton label="← Back" onPress={() => setMode('choose')} />
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    padding: space.md,
  },
  choiceEmoji: { fontSize: 22 },
  choiceTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.ink },
  choiceSub: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: colors.inkFaint, marginTop: 1 },
  categoryHeader: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.inkQuietFaint,
    marginBottom: space.sm,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: space.md,
  },
  suggestionEmoji: { fontSize: 24 },
  suggestionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.ink, flex: 1 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: colors.ink,
  },
});
