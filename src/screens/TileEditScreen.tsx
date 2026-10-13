import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { tileAt, uid } from '../domain/logic';
import type { PlanStep } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { SheetShell } from '../ui/SheetShell';
import { SuggestionPicker } from '../ui/SuggestionPicker';
import { colors, radius, space, type } from '../ui/theme';

/** Everything deeper than the quick-actions sheet (TileSheetScreen) lives here, reached
 *  via its "✎ Edit": retyping the tile's own label/note, swapping it for a different
 *  idea, and — replacing the old AI "Research a plan for this" — a manual, user-typed
 *  step-by-step plan, since AI features are on hold for v1. `dim={false}` on SheetShell
 *  deliberately: TileSheet's own backdrop, still mounted underneath this screen, is
 *  already dimming the grid — painting a second scrim here would double-darken it. */
export default function TileEditScreen({ route, navigation }: any) {
  const cell: number = route.params?.cell ?? 0;
  const cardId: string = route.params?.cardId;
  const { state, setTile, updateTileContent, setTilePlan } = useApp();
  const card = state.cards.find((c) => c.id === cardId);
  const tile = card ? tileAt(card, cell) : undefined;

  const [label, setLabel] = useState(tile?.label ?? '');
  const [note, setNote] = useState(tile?.note ?? '');
  const [showSwap, setShowSwap] = useState(false);

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
    updateTileContent(cardId, cell, { label, note });
    close();
  };

  const addStep = () => {
    const title = newTitle.trim();
    if (!title) return;
    const step: PlanStep = { id: uid('step'), title, detail: newDetail.trim() || undefined, done: false };
    setTilePlan(cardId, cell, [...plan, step]);
    setNewTitle('');
    setNewDetail('');
    setAddingStep(false);
  };

  const toggleStepDone = (id: string) => {
    setTilePlan(cardId, cell, plan.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const beginStepEdit = (step: PlanStep) => {
    setEditingStepId(step.id);
    setEditTitle(step.title);
    setEditDetail(step.detail ?? '');
  };

  const saveStepEdit = () => {
    if (!editingStepId) return;
    setTilePlan(
      cardId,
      cell,
      plan.map((s) => (s.id === editingStepId ? { ...s, title: editTitle.trim() || s.title, detail: editDetail.trim() || undefined } : s))
    );
    setEditingStepId(null);
  };

  const deleteStep = (id: string) => {
    setTilePlan(cardId, cell, plan.filter((s) => s.id !== id));
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
      <TextInput defaultValue={label} onChangeText={setLabel} style={styles.input} placeholder="Tile label" placeholderTextColor={colors.inkFaint} />

      <Text style={[styles.sectionLabel, { marginTop: space.md }]}>NOTE</Text>
      <TextInput
        defaultValue={note}
        onChangeText={setNote}
        style={[styles.input, styles.noteInput]}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.inkFaint}
        multiline
      />
      <PrimaryButton label="Save changes" tone="clay" onPress={saveContent} style={{ marginTop: space.md }} />

      {!showSwap ? (
        <GhostButton label="Swap for a different idea" onPress={() => setShowSwap(true)} style={{ marginTop: space.lg }} />
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Text style={styles.sectionLabel}>SWAP FOR SOMETHING ELSE</Text>
          <View style={{ marginTop: space.sm }}>
            <SuggestionPicker
              usedBankIds={usedBankIds}
              onPicked={(seed) => {
                setTile(cardId, cell, seed);
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
                      onChangeText={setEditTitle}
                      style={styles.stepEditInput}
                      placeholder="Step title"
                      placeholderTextColor={colors.inkFaint}
                    />
                    <TextInput
                      defaultValue={editDetail}
                      onChangeText={setEditDetail}
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
              onChangeText={setNewTitle}
              style={styles.stepEditInput}
              placeholder="Step title"
              placeholderTextColor={colors.inkFaint}
              autoFocus
            />
            <TextInput
              defaultValue={newDetail}
              onChangeText={setNewDetail}
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
