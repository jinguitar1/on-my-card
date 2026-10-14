import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { collapseDictationDuplicate } from '../domain/dictation';
import { prettyDate, tileAt, uid } from '../domain/logic';
import type { PlanStep } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { SheetShell } from '../ui/SheetShell';
import { SuggestionPicker } from '../ui/SuggestionPicker';
import { colors, radius, space, type } from '../ui/theme';

const DEADLINE_WEB_PRESETS = [
  { label: '1 week', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

/** Everything deeper than the quick-actions sheet (TileSheetScreen) lives here, reached
 *  via its "✎ Edit": retyping the tile's own label/note, swapping it for a different
 *  idea, and — replacing the old AI "Research a plan for this" — a manual, user-typed
 *  step-by-step plan, since AI features are on hold for v1. `dim={false}` on SheetShell
 *  deliberately: TileSheet's own backdrop, still mounted underneath this screen, is
 *  already dimming the grid — painting a second scrim here would double-darken it. */
export default function TileEditScreen({ route, navigation }: any) {
  const cell: number = route.params?.cell ?? 0;
  const scheduleId: string = route.params?.scheduleId;
  const { state, createGoal, setTile, updateTileContent, setTilePlan, setTileDeadline } = useApp();
  const schedule = state.schedules.find((s) => s.id === scheduleId);
  const card = schedule?.instances[schedule.instances.length - 1];
  const tile = card ? tileAt(card, cell) : undefined;

  const [label, setLabel] = useState(tile?.title ?? '');
  const [note, setNote] = useState(tile?.note ?? '');
  const [showSwap, setShowSwap] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  // iOS's spinner fires onChange continuously as each wheel column settles mid-scroll —
  // same buffering fix as SettingsScreen's TimeSlots, for the same reason: committing
  // straight from onChange would grab an intermediate value, not the one actually
  // settled on. Android's picker is a modal dialog that only calls onChange once.
  const [pendingDeadline, setPendingDeadline] = useState(new Date(Date.now() + 7 * 86_400_000));

  const [addingStep, setAddingStep] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  // id-keyed, not index-keyed — a manual list supports real mid-list delete (unlike the
  // AI version this replaced, which only ever replaced its whole array at once via
  // "Try again"), and deleting while editing a later row by index would desync.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');

  const usedBankIds = useMemo(() => new Set((card?.tiles ?? []).map((t) => t.bankId).filter(Boolean) as string[]), [card]);

  if (!card || !tile) {
    navigation.goBack();
    return null;
  }

  const close = () => navigation.goBack();
  const plan = tile.plan ?? [];

  const saveContent = () => {
    updateTileContent(scheduleId, cell, { title: label, note });
    close();
  };

  const addStep = () => {
    const title = newTitle.trim();
    if (!title) return;
    const step: PlanStep = { id: uid('step'), title, detail: newDetail.trim() || undefined, done: false };
    setTilePlan(scheduleId, cell, [...plan, step]);
    setNewTitle('');
    setNewDetail('');
    setAddingStep(false);
  };

  const toggleStepDone = (id: string) => {
    setTilePlan(scheduleId, cell, plan.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const beginStepEdit = (step: PlanStep) => {
    setEditingStepId(step.id);
    setEditTitle(step.title);
    setEditDetail(step.detail ?? '');
  };

  const saveStepEdit = () => {
    if (!editingStepId) return;
    setTilePlan(
      scheduleId,
      cell,
      plan.map((s) => (s.id === editingStepId ? { ...s, title: editTitle.trim() || s.title, detail: editDetail.trim() || undefined } : s))
    );
    setEditingStepId(null);
  };

  const deleteStep = (id: string) => {
    setTilePlan(scheduleId, cell, plan.filter((s) => s.id !== id));
    setEditingStepId(null);
  };

  return (
    <SheetShell onClose={close} dim={false}>
      <View style={styles.header}>
        <Text style={[type.quietDisplay, styles.headerTitle]}>{tile.emoji} Edit tile</Text>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>

      {/* `defaultValue`, not `value`, throughout this screen — avoids the iOS-dictation
          duplicate-text bug a controlled TextInput causes. Safe everywhere it's used here
          since every field that needs to reset after a save/cancel (the step-add and
          step-edit forms below) is itself behind a conditional mount, so toggling it off
          and back on already gives a fresh instance with no stale text to clear. */}
      <Text style={styles.sectionLabel}>LABEL</Text>
      <TextInput defaultValue={label} onChangeText={(t) => setLabel(collapseDictationDuplicate(t))} style={styles.input} placeholder="Tile label" placeholderTextColor={colors.inkFaint} />

      <Text style={[styles.sectionLabel, { marginTop: space.md }]}>NOTE</Text>
      <TextInput
        defaultValue={note}
        onChangeText={(t) => setNote(collapseDictationDuplicate(t))}
        style={[styles.input, styles.noteInput]}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.inkFaint}
        multiline
      />
      <PrimaryButton label="Save changes" tone="clay" onPress={saveContent} style={{ marginTop: space.md }} />

      {/* A deadline for this one goal, this one card cycle — not the underlying Goal, and
          separate from the card's own timeline (CreateCardScreen's "Set a timeline for
          this card"). Commits immediately on pick/clear, same as the plan steps below,
          rather than waiting on "Save changes" (which only covers label/note). */}
      <Text style={[styles.sectionLabel, { marginTop: space.lg }]}>DEADLINE</Text>
      {tile.deadline ? (
        <View style={styles.deadlineRow}>
          <Text style={styles.deadlineText}>Due {prettyDate(tile.deadline)}</Text>
          <Pressable onPress={() => setTileDeadline(scheduleId, cell, undefined)} hitSlop={8}>
            <Text style={styles.deadlineClear}>Clear</Text>
          </Pressable>
        </View>
      ) : Platform.OS === 'web' ? (
        <View style={styles.chips}>
          {DEADLINE_WEB_PRESETS.map((p) => (
            <Pressable
              key={p.days}
              onPress={() => setTileDeadline(scheduleId, cell, Date.now() + p.days * 86_400_000)}
              style={styles.chip}
            >
              <Text style={styles.chipText}>+{p.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <GhostButton
            label="+ Set a deadline"
            onPress={() => {
              setPendingDeadline(new Date(Date.now() + 7 * 86_400_000));
              setShowDeadlinePicker(true);
            }}
          />
          {showDeadlinePicker && (
            <DateTimePicker
              value={pendingDeadline}
              mode="date"
              minimumDate={new Date()}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                if (Platform.OS === 'android') {
                  setShowDeadlinePicker(false);
                  // Android's dismiss action still calls onChange with the picker's
                  // *original* value, not undefined — `event.type` is the only reliable
                  // way to tell a real pick apart from a cancel (confirmed from the
                  // library's own source: DISMISS_ACTION fires onChange(event, originalValue)).
                  if (event.type !== 'dismissed' && date) setTileDeadline(scheduleId, cell, date.getTime());
                  return;
                }
                if (date) setPendingDeadline(date);
              }}
            />
          )}
          {Platform.OS === 'ios' && showDeadlinePicker && (
            <GhostButton
              label="Done"
              onPress={() => {
                setTileDeadline(scheduleId, cell, pendingDeadline.getTime());
                setShowDeadlinePicker(false);
              }}
              style={{ marginTop: space.xs }}
            />
          )}
        </>
      )}

      {!showSwap ? (
        <GhostButton label="Swap for a different idea" onPress={() => setShowSwap(true)} style={{ marginTop: space.lg }} />
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Text style={styles.sectionLabel}>SWAP FOR SOMETHING ELSE</Text>
          <View style={{ marginTop: space.sm }}>
            <SuggestionPicker
              usedBankIds={usedBankIds}
              onPicked={(seed) => {
                // Same fast-path defaults as a fresh fill (TileSheetScreen) — difficulty
                // and type are editable later from the goal library, never a mandatory
                // prompt before a swap can finish.
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
          <GhostButton label="Cancel" onPress={() => setShowSwap(false)} style={{ marginTop: space.sm }} />
        </View>
      )}

      <View style={styles.planSection}>
        <Text style={styles.sectionLabel}>PLAN</Text>
        {plan.length === 0 && !addingStep && <GhostButton label="+ Set up a plan" onPress={() => setAddingStep(true)} />}

        {plan.map((step, i) => {
          const isSelected = selectedStepId === step.id;
          const isEditing = editingStepId === step.id;
          return (
            <Pressable
              key={step.id}
              onPress={() => !isEditing && setSelectedStepId((s) => (s === step.id ? null : step.id))}
              style={[styles.stepRow, isSelected && styles.stepRowSelected]}
            >
              <Pressable
                onPress={() => toggleStepDone(step.id)}
                hitSlop={8}
                style={[styles.stepCheckbox, step.done && styles.stepCheckboxDone]}
              >
                <Text style={[styles.stepNum, isSelected && styles.stepNumSelected, step.done && styles.stepNumDone]}>
                  {step.done ? '✓' : i + 1}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                {isEditing ? (
                  <View style={{ gap: space.xs }}>
                    <TextInput
                      defaultValue={editTitle}
                      onChangeText={(t) => setEditTitle(collapseDictationDuplicate(t))}
                      style={styles.stepEditInput}
                      placeholder="Step title"
                      placeholderTextColor={colors.inkFaint}
                    />
                    <TextInput
                      defaultValue={editDetail}
                      onChangeText={(t) => setEditDetail(collapseDictationDuplicate(t))}
                      style={[styles.stepEditInput, styles.stepEditDetailInput]}
                      placeholder="Detail (optional)"
                      placeholderTextColor={colors.inkFaint}
                      multiline
                    />
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <GhostButton danger label="Delete" onPress={() => deleteStep(step.id)} style={{ flex: 1 }} />
                      <GhostButton label="Cancel" onPress={() => setEditingStepId(null)} style={{ flex: 1 }} />
                      <PrimaryButton label="Save" onPress={saveStepEdit} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{step.title}</Text>
                    {!!step.detail && <Text style={[styles.stepDetail, step.done && styles.stepDetailDone]}>{step.detail}</Text>}
                  </>
                )}
              </View>
              {!isEditing && (
                <Pressable onPress={() => beginStepEdit(step)} hitSlop={8} style={styles.stepEditIconWrap}>
                  <Text style={styles.stepEditIcon}>✎</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}

        {addingStep && (
          <View style={styles.addStepBox}>
            <TextInput
              defaultValue={newTitle}
              onChangeText={(t) => setNewTitle(collapseDictationDuplicate(t))}
              style={styles.stepEditInput}
              placeholder="Step title"
              placeholderTextColor={colors.inkFaint}
              autoFocus
            />
            <TextInput
              defaultValue={newDetail}
              onChangeText={(t) => setNewDetail(collapseDictationDuplicate(t))}
              style={[styles.stepEditInput, styles.stepEditDetailInput]}
              placeholder="Detail (optional)"
              placeholderTextColor={colors.inkFaint}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <GhostButton
                label="Cancel"
                onPress={() => {
                  setAddingStep(false);
                  setNewTitle('');
                  setNewDetail('');
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton label="Add step" onPress={addStep} disabled={!newTitle.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {plan.length > 0 && !addingStep && (
          <GhostButton label="+ Add another step" onPress={() => setAddingStep(true)} style={{ marginTop: space.sm }} />
        )}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.sm },
  headerTitle: { flex: 1, marginRight: space.sm, fontSize: 22 },
  close: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint, paddingTop: 4 },
  sectionLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1.2, color: colors.inkQuietFaint, marginBottom: space.xs },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deadlineText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  deadlineClear: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.danger },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkSoft },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
    color: colors.ink,
  },
  noteInput: { minHeight: 60, textAlignVertical: 'top' },
  planSection: { marginTop: space.xl },
  stepRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
    alignItems: 'flex-start',
    padding: space.sm,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  stepRowSelected: { borderLeftColor: colors.accentClay, backgroundColor: colors.accentClaySoft },
  stepCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.lineQuiet,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheckboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkSoft },
  stepNumSelected: { color: colors.accentClay },
  stepNumDone: { color: '#fff' },
  stepTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  stepTitleDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  stepDetail: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: colors.inkFaint, marginTop: 2, lineHeight: 16 },
  stepDetailDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  stepEditIconWrap: { padding: 2 },
  stepEditIcon: { fontSize: 15, color: colors.inkFaint },
  stepEditInput: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: colors.ink,
  },
  stepEditDetailInput: { minHeight: 44, textAlignVertical: 'top' },
  addStepBox: { gap: space.xs, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineQuiet, padding: space.sm },
});
