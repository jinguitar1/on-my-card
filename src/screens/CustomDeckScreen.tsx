import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { collapseDictationDuplicate } from '../domain/dictation';
import { CAPACITY } from '../domain/types';
import { uid } from '../domain/logic';
import { type TileIdea } from '../domain/tileBank';
import { stampHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { PrimaryButton, ProgressBar } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

// CreateCardScreen's own `deckHeader` row (back link + title field + save-later link)
// sits above this component as a sibling, not as part of it — its real height isn't
// knowable from here, so this is a reasonable fixed estimate added on top of the safe
// area inset for `keyboardVerticalOffset` below, the same fix that resolved the
// identical "button hidden behind the keyboard" issue on the intent screen's own header.
const PARENT_HEADER_HEIGHT = 56;

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
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + PARENT_HEADER_HEIGHT}
    >
      <View style={styles.progressRow}>
        <ProgressBar pct={progressPct} color={colors.accentClay} height={6} />
        <Text style={styles.progressHint}>
          {kept.length}/{CAPACITY} added
        </Text>
      </View>

      {/* The add-tile form and both buttons used to live in a separate, fixed-at-the-
          bottom `addBox` sibling, outside this ScrollView — fine when everything fit, but
          with the keyboard up (taking roughly a third of the screen) plus a multi-line
          note, that fixed section could run taller than the space actually left above the
          keyboard, with nowhere for the overflow to go and no way to scroll down to reach
          "Finish With N Tiles". Folding it into the same scrollable content as the kept
          list means the worst case is now "scroll a bit," never "permanently hidden." */}
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

        <View style={styles.addBox}>
          {/* `defaultValue` (not `value`) avoids the iOS-dictation duplicate-text bug a
              fully controlled TextInput causes — the trade-off is that these inputs can no
              longer be cleared programmatically by changing `label`/`note` state alone. The
              `key` tied to `kept.length` is the fix for that: it changes exactly once per
              successful add, forcing React to remount a fresh, empty instance right as
              `label`/`note` are reset to '', rather than leaving stale dictated text in the
              same native text field. */}
          <TextInput
            key={`label-${kept.length}`}
            defaultValue={label}
            onChangeText={(t) => setLabel(collapseDictationDuplicate(t))}
            placeholder="What Do You Want To Do?"
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            returnKeyType="done"
          />
          <TextInput
            key={`note-${kept.length}`}
            defaultValue={note}
            onChangeText={(t) => setNote(collapseDictationDuplicate(t))}
            placeholder="Add A Note (Optional)"
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, styles.noteInput]}
            multiline
          />
          <PrimaryButton label="+ Add Tile" tone="clay" onPress={addTile} disabled={!label.trim()} style={{ marginTop: space.sm }} />
          {/* A solid PrimaryButton, not a plain-text GhostButton, matching the same
              "heighten it, make it more visible" fix applied to Curated's own finish
              button — the two paths should look and feel the same at this step. */}
          {kept.length > 0 && (
            <PrimaryButton
              label={`Finish With ${kept.length} Tile${kept.length === 1 ? '' : 's'}`}
              onPress={() => onDone(kept)}
              style={{ marginTop: space.xs, paddingVertical: 18 }}
            />
          )}
        </View>
      </ScrollView>
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
