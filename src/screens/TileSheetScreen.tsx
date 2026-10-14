import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isTileCrossed, prettyDate, tileAt } from '../domain/logic';
import { CENTER } from '../domain/types';
import { playOutcomeFeedback } from '../feedback/celebrate';
import { useSound } from '../feedback/sound';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { SheetShell } from '../ui/SheetShell';
import { SuggestionPicker } from '../ui/SuggestionPicker';
import { colors, space, type } from '../ui/theme';

/** The quick-reach sheet opened by tapping any grid cell — a `transparentModal` over the
 *  still-visible, dimmed grid (see RootNavigator.tsx), not a new opaque page. Two jobs
 *  only: fill an empty square (via `SuggestionPicker`), or act fast on a filled one
 *  (cross off / focus / remove) with a single door — "✎ Edit" — into the deeper stuff
 *  (retyping the tile, swapping it, planning it out), which lives on its own screen,
 *  `TileEditScreen`, stacked on top of this one. */
export default function TileSheetScreen({ route, navigation }: any) {
  const cell: number = route.params?.cell ?? 0;
  const scheduleId: string = route.params?.scheduleId;
  const { state, createGoal, setTile, pressTile, clearTile, setFocusedTile } = useApp();
  const sound = useSound();
  const schedule = state.schedules.find((s) => s.id === scheduleId);
  const card = schedule?.instances[schedule.instances.length - 1];
  const tile = card ? tileAt(card, cell) : undefined;
  const isEmpty = !tile;

  const usedBankIds = useMemo(() => new Set((card?.tiles ?? []).map((t) => t.bankId).filter(Boolean) as string[]), [card]);

  if (!card || !schedule || cell === CENTER) {
    navigation.goBack();
    return null;
  }

  const crossed = isTileCrossed(tile);
  const isFocused = !!tile && card.focusedTileId === tile.id;
  const close = () => navigation.goBack();

  // Crossing off (and un-crossing) only ever happens from here now — the grid itself
  // no longer toggles on tap, so this button is the one deliberate place it can happen.
  // The bingo/card-complete celebration overlay still fires normally (it's driven by the
  // global queue pressTile enqueues into, independent of which screen called it); haptics
  // and sound are replayed here explicitly since they're screen-local.
  const crossOff = () => {
    const outcome = pressTile(scheduleId, cell);
    playOutcomeFeedback(outcome, sound);
    close();
  };

  // Setting (or clearing) focus is a complete action on its own now — it snaps straight
  // back to the grid instead of leaving you sitting on this sheet, matching every other
  // action here.
  const toggleFocus = () => {
    setFocusedTile(scheduleId, isFocused ? null : tile!.id);
    close();
  };

  if (isEmpty) {
    return (
      <SheetShell onClose={close}>
        <View style={styles.header}>
          <Text style={[type.quietDisplay, styles.headerTitle]}>Fill this square</Text>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.lead}>How do you want to fill it?</Text>
        <View style={{ marginTop: space.md }}>
          <SuggestionPicker
            usedBankIds={usedBankIds}
            onPicked={(seed) => {
              // A quick fill from the grid stays a one-tap action — sensible defaults
              // (Medium / one-off), both editable later from the goal's own TileEdit
              // screen, rather than forcing a difficulty/type prompt before this square
              // can be filled at all.
              const goal = createGoal({
                title: seed.label,
                difficulty: 'medium',
                type: 'oneOff',
                emoji: seed.emoji,
                note: seed.note,
                category: seed.category,
                bankId: seed.bankId,
              });
              setTile(scheduleId, cell, goal.id);
              close();
            }}
          />
        </View>
      </SheetShell>
    );
  }

  return (
    <SheetShell onClose={close}>
      <View style={styles.header}>
        <Text style={[type.quietDisplay, styles.headerTitle]}>
          {tile!.emoji} {tile!.title}
        </Text>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      {!!tile!.note && <Text style={styles.lead}>{tile!.note}</Text>}
      {!!tile!.deadline && (
        <Text style={[styles.deadline, !crossed && tile!.deadline < Date.now() && styles.deadlineOverdue]}>
          {!crossed && tile!.deadline < Date.now() ? 'Was due ' : 'Due '}
          {prettyDate(tile!.deadline)}
        </Text>
      )}

      <PrimaryButton
        label={crossed ? 'Mark not done' : 'I did this'}
        tone={crossed ? 'danger' : 'clay'}
        onPress={crossOff}
        style={{ marginTop: space.xl }}
      />
      {!crossed && (
        <GhostButton
          label={isFocused ? '★ Focused, tap to unfocus' : '☆ Focus on this'}
          onPress={toggleFocus}
          style={{ marginTop: space.sm }}
        />
      )}
      {/* Always available, even on a crossed tile — it's the only way back into a
          finished tile's note or plan afterward. */}
      <GhostButton label="✎ Edit" onPress={() => navigation.navigate('TileEdit', { scheduleId, cell })} style={{ marginTop: space.sm }} />
      <GhostButton
        danger
        label="Remove this square"
        onPress={() => {
          clearTile(scheduleId, cell);
          close();
        }}
        style={{ marginTop: space.sm }}
      />
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.sm },
  // flex: 1 (not a bare Text with no width constraint) is what actually fixes the clip —
  // without it a long tile label just keeps growing and pushes "Close" off the right
  // edge of the sheet instead of wrapping within the space left for it.
  headerTitle: { flex: 1, marginRight: space.sm, fontSize: 24 },
  close: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint, paddingTop: 4 },
  lead: { ...type.quietBody, color: colors.inkSoft, lineHeight: 20 },
  deadline: { ...type.quietBody, fontSize: 12, color: colors.inkQuietFaint, marginTop: space.xs },
  deadlineOverdue: { color: colors.danger, fontWeight: '700' },
});
