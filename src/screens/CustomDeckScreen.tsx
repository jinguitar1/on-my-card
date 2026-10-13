import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CAPACITY } from '../domain/types';
import { uid } from '../domain/logic';
import { type TileIdea } from '../domain/tileBank';
import { stampHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { GhostButton, PrimaryButton, ProgressBar } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

/** The "Customized" path in CreateCardScreen — type your own tiles one at a time instead
 *  of swiping through either the curated bank or an AI-researched deck. There's nothing
 *  to keep-or-skip here (every tile is one you wrote yourself), so this is a plain
 *  add-to-a-list form, not the swipe mechanic — SwipeDeckScreen's own "write your own
 *  instead" escape hatch already covers the "I don't like any of these" case within the
 *  curated-bank path; this is the dedicated path for someone who wants to author the
 *  whole card by hand from the start. */
export default function CustomDeckScreen({
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
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    onProgress?.(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept]);

  const addTile = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // No default/auto-assigned emoji here (a hand-with-pencil icon used to stand in for
    // every one) — a custom tile just carries whatever the user typed, nothing picked on
    // their behalf; CardTile already skips its emoji slot entirely when it's empty.
    const idea: TileIdea = { id: uid('custom'), emoji: '', label: trimmed, note: note.trim() };
    const next = [...kept, idea];
    setKept(next);
    stampHit();
    sound.play('stamp');
    setLabel('');
    setNote('');
    if (next.length >= CAPACITY) onDone(next);
  };

  const removeTile = (id: string) => setKept((k) => k.filter((t) => t.id !== id));

  const progressPct = Math.min(100, (kept.length / CAPACITY) * 100);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.progressRow}>
        <ProgressBar pct={progressPct} color={colors.accentClay} height={6} />
        <Text style={styles.progressHint}>
          {kept.length}/{CAPACITY} added
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {kept.length === 0 && <Text style={styles.empty}>Add your first tile below. A dare, a goal, anything you want on the card.</Text>}
        {kept.map((t) => (
          <View key={t.id} style={styles.row}>
            {!!t.emoji && <Text style={styles.rowEmoji}>{t.emoji}</Text>}
            <Text style={styles.rowLabel} numberOfLines={1}>
              {t.label}
            </Text>
            <Pressable onPress={() => removeTile(t.id)} hitSlop={8}>
              <Text style={styles.rowRemove}>✕</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.addBox}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="What Do You Want To Do?"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          returnKeyType="done"
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add A Note (Optional)"
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, styles.noteInput]}
          multiline
        />
        <PrimaryButton label="+ Add Tile" tone="clay" onPress={addTile} disabled={!label.trim()} style={{ marginTop: space.sm }} />
        {kept.length > 0 && (
          <GhostButton
            label={`Finish With ${kept.length} Tile${kept.length === 1 ? '' : 's'}`}
            onPress={() => onDone(kept)}
            style={{ marginTop: space.xs }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progressRow: { paddingHorizontal: space.lg, marginBottom: space.sm },
  progressHint: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: colors.inkQuietFaint, textAlign: 'center', marginTop: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.xs },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.inkFaint, textAlign: 'center', paddingVertical: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingVertical: 8,
    paddingHorizontal: space.sm,
  },
  rowEmoji: { fontSize: 18 },
  rowLabel: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  rowRemove: { fontSize: 14, color: colors.inkFaint, padding: 2 },
  addBox: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.lineQuiet,
    gap: space.sm,
    backgroundColor: colors.paperQuiet,
  },
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
  noteInput: { minHeight: 44, textAlignVertical: 'top' },
});
