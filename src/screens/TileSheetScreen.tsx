import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useInsight } from '../ai/useInsight';
import { useAuth } from '../auth/AuthContext';
import { isTileCrossed, tileAt } from '../domain/logic';
import { randomSuggestions } from '../domain/tileBank';
import { CENTER } from '../domain/types';
import { playOutcomeFeedback } from '../feedback/celebrate';
import { useSound } from '../feedback/sound';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { categoryColor, colors, radius, space, type } from '../ui/theme';

interface BreakdownStep {
  title: string;
  detail: string;
  done?: boolean;
}

function parseSteps(content: string | undefined): BreakdownStep[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.steps)) return parsed.steps;
  } catch {
    // ignore — the Edge Function already normalizes this, but stay defensive
  }
  return [];
}

interface TileIdea {
  emoji: string;
  label: string;
  note: string;
}

function parseIdeas(content: string | undefined): TileIdea[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.tiles)) return parsed.tiles;
  } catch {
    // ignore — the Edge Function already normalizes this, but stay defensive
  }
  return [];
}

/** The "Research an idea with AI" option for an empty/swap square — aware of every
 *  tile already on this specific card (threaded through as cardId server-side) so it
 *  never suggests a duplicate. Shares the exact `{tiles:[{emoji,label,note}]}` shape
 *  tilegen already uses, just for 3 ideas instead of a full 24-30-tile deck. Tapping an
 *  idea applies it immediately, same as a bank suggestion — no extra preview step. */
function AiIdeaPicker({ cardId, cell, onPick }: { cardId: string; cell: number; onPick: (idea: TileIdea) => void }) {
  const { insight, loading, refresh } = useInsight('tilesuggest', { cardId, cell, auto: false });
  const ideas = useMemo(() => parseIdeas(insight?.content), [insight]);

  if (ideas.length === 0) {
    // This can genuinely take up to a minute (the same web-search round trip tilegen's
    // card generation does) — the request itself doesn't depend on this screen staying
    // open (it's a plain network call, not tied to the component's lifetime), so closing
    // this sheet or switching tabs never cancels it. The copy says so explicitly rather
    // than leaving a bare spinner, which read as broken/stuck when the wait ran long.
    return loading ? (
      <View style={[styles.breakdownLoading, { marginTop: space.md }]}>
        <ActivityIndicator color={colors.ink} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lead}>Researching ideas…</Text>
          <Text style={styles.hint}>
            Can take up to a minute. Feel free to close this and keep using the app — come back and tap again
            when you're ready, it'll pick up right where it left off.
          </Text>
        </View>
      </View>
    ) : (
      <GhostButton label="🔍 Research an idea with AI" onPress={() => refresh(false)} style={{ marginTop: space.md }} />
    );
  }

  return (
    <View style={{ marginTop: space.md }}>
      <Text style={styles.breakdownKicker}>AI RESEARCHED</Text>
      <View style={{ gap: space.sm }}>
        {ideas.map((idea, i) => (
          <Pressable key={i} onPress={() => onPick(idea)} style={styles.suggestion}>
            <Text style={styles.suggestionEmoji}>{idea.emoji}</Text>
            <Text style={styles.suggestionLabel}>{idea.label}</Text>
          </Pressable>
        ))}
      </View>
      <GhostButton
        label={loading ? 'Researching…' : '↻ Try different ideas'}
        onPress={() => refresh(true)}
        disabled={loading}
        style={{ marginTop: space.sm }}
      />
      {loading && (
        <Text style={[styles.hint, { marginTop: space.xs }]}>
          Can take up to a minute — the ideas above stay pickable while new ones research.
        </Text>
      )}
    </View>
  );
}

export default function TileSheetScreen({ route, navigation }: any) {
  const cell: number = route.params?.cell ?? 0;
  const cardId: string = route.params?.cardId;
  const { state, setTile, pressTile, clearTile, setFocusedTile } = useApp();
  const sound = useSound();
  const card = state.cards.find((c) => c.id === cardId);
  const tile = card ? tileAt(card, cell) : undefined;
  const isEmpty = !tile;

  const usedBankIds = useMemo(() => new Set((card?.tiles ?? []).map((t) => t.bankId).filter(Boolean) as string[]), [card]);
  const suggestions = useMemo(() => randomSuggestions(usedBankIds, 3), [usedBankIds]);

  const [typedLabel, setTypedLabel] = useState('');
  const [showTypeYourOwn, setShowTypeYourOwn] = useState(false);
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const [planContext, setPlanContext] = useState('');
  // Which step is highlighted, purely as an in-view "which one am I on" aid — session
  // only, resets if the sheet is closed and reopened.
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');

  const { status: authStatus } = useAuth();
  const { insight: breakdown, loading: breakdownLoading, refresh: refreshBreakdown, updateContent } = useInsight('breakdown', {
    tileId: tile?.id,
    auto: false,
  });
  const steps = useMemo(() => parseSteps(breakdown?.content), [breakdown]);

  // Multiline TextInput's return key just inserts a newline on-device — there's no
  // native "Enter submits" for a multiline field — so this is the standard trick:
  // treat a trailing newline in onChangeText as the submit signal instead of letting
  // it land in the box, rather than switching to a cramped single-line input.
  const handleContextChange = (v: string) => {
    if (v.endsWith('\n') && v.trim().length > 0) {
      const stripped = v.slice(0, -1);
      setPlanContext(stripped);
      refreshBreakdown(steps.length > 0, stripped);
      return;
    }
    setPlanContext(v);
  };

  const beginStepEdit = (i: number) => {
    setEditingStepIndex(i);
    setEditTitle(steps[i].title);
    setEditDetail(steps[i].detail);
  };

  // A pure text edit, not a new plan — writes straight to the cached row instead of
  // calling Claude again, so "make your own steps" is instant and free.
  const saveStepEdit = async (i: number) => {
    const nextSteps = steps.map((s, idx) => (idx === i ? { ...s, title: editTitle.trim() || s.title, detail: editDetail.trim() } : s));
    setEditingStepIndex(null);
    await updateContent(JSON.stringify({ steps: nextSteps }));
  };

  // Crossing off a step someone's actually completed — same instant, no-Claude-call
  // write as an edit. A full "↻ Try again" regenerate still resets every step's `done`,
  // since that's a genuinely new plan.
  const toggleStepDone = async (i: number) => {
    const nextSteps = steps.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s));
    await updateContent(JSON.stringify({ steps: nextSteps }));
  };

  if (!card || cell === CENTER) {
    navigation.goBack();
    return null;
  }

  const crossed = isTileCrossed(tile);
  const isFocused = !!tile && card.focusedTileId === tile.id;
  const toggleFocus = () => setFocusedTile(cardId, isFocused ? null : tile!.id);

  const pick = (s: (typeof suggestions)[number]) => {
    setTile(cardId, cell, { label: s.label, emoji: s.emoji, note: s.note, category: s.category, bankId: s.id });
    navigation.goBack();
  };

  // An AI-researched idea instead of a curated-bank one — no category/bankId, same as
  // a hand-typed tile, since it isn't from the fixed bank.
  const pickAi = (idea: TileIdea) => {
    setTile(cardId, cell, { label: idea.label, emoji: idea.emoji, note: idea.note });
    navigation.goBack();
  };

  const saveTyped = () => {
    if (!typedLabel.trim()) return;
    setTile(cardId, cell, { label: typedLabel.trim() });
    navigation.goBack();
  };

  // Crossing off (and un-crossing) only ever happens from here now — the grid itself
  // no longer toggles on tap, so this button is the one deliberate place it can happen.
  // The bingo/card-complete celebration overlay still fires normally (it's driven by the
  // global queue pressTile enqueues into, independent of which screen called it); haptics
  // and sound are replayed here explicitly since they're screen-local.
  const crossOff = () => {
    const outcome = pressTile(cardId, cell);
    playOutcomeFeedback(outcome, sound);
    navigation.goBack();
  };

  if (isEmpty) {
    return (
      <View style={styles.wrap}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <View style={styles.header}>
            <Text style={[type.h1, styles.headerTitle]}>Fill this square</Text>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.lead}>Pick one, or write your own.</Text>

          <View style={{ gap: space.sm, marginTop: space.md }}>
            {suggestions.map((s) => (
              <Pressable key={s.id} onPress={() => pick(s)} style={[styles.suggestion, { borderColor: categoryColor(s.category) }]}>
                <Text style={styles.suggestionEmoji}>{s.emoji}</Text>
                <Text style={styles.suggestionLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {authStatus === 'signedIn' && <AiIdeaPicker cardId={cardId} cell={cell} onPick={pickAi} />}

          {!showTypeYourOwn ? (
            <GhostButton label="Or type your own" onPress={() => setShowTypeYourOwn(true)} style={{ marginTop: space.lg }} />
          ) : (
            <View style={{ marginTop: space.lg }}>
              <TextInput
                value={typedLabel}
                onChangeText={setTypedLabel}
                placeholder="Type it here"
                placeholderTextColor={colors.inkFaint}
                style={styles.input}
                autoFocus
              />
              <PrimaryButton label="Add it" onPress={saveTyped} disabled={!typedLabel.trim()} style={{ marginTop: space.sm }} />
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (showSwapPicker) {
    return (
      <View style={styles.wrap}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <View style={styles.header}>
            <Text style={[type.h1, styles.headerTitle]}>Swap for a different idea</Text>
            <Pressable onPress={() => setShowSwapPicker(false)} hitSlop={8}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.lead}>Pick a new one, or write your own.</Text>

          <View style={{ gap: space.sm, marginTop: space.md }}>
            {suggestions.map((s) => (
              <Pressable key={s.id} onPress={() => pick(s)} style={[styles.suggestion, { borderColor: categoryColor(s.category) }]}>
                <Text style={styles.suggestionEmoji}>{s.emoji}</Text>
                <Text style={styles.suggestionLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {authStatus === 'signedIn' && <AiIdeaPicker cardId={cardId} cell={cell} onPick={pickAi} />}

          {!showTypeYourOwn ? (
            <GhostButton label="Or type your own" onPress={() => setShowTypeYourOwn(true)} style={{ marginTop: space.lg }} />
          ) : (
            <View style={{ marginTop: space.lg }}>
              <TextInput
                value={typedLabel}
                onChangeText={setTypedLabel}
                placeholder="Type it here"
                placeholderTextColor={colors.inkFaint}
                style={styles.input}
                autoFocus
              />
              <PrimaryButton label="Add it" onPress={saveTyped} disabled={!typedLabel.trim()} style={{ marginTop: space.sm }} />
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View style={styles.header}>
          <Text style={[type.h1, styles.headerTitle]}>{tile!.emoji} {tile!.label}</Text>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        {!!tile!.note && <Text style={styles.lead}>{tile!.note}</Text>}

        <PrimaryButton
          label={crossed ? 'Mark not done' : 'Cross it off'}
          tone={crossed ? 'danger' : 'gold'}
          onPress={crossOff}
          style={{ marginTop: space.xl }}
        />
        {!crossed && (
          <GhostButton label="Swap for a different idea" onPress={() => setShowSwapPicker(true)} style={{ marginTop: space.sm }} />
        )}
        {!crossed && (
          <GhostButton
            label={isFocused ? '★ Focused — tap to unfocus' : '☆ Focus on this'}
            onPress={toggleFocus}
            style={{ marginTop: space.sm }}
          />
        )}
        <GhostButton
          danger
          label="Remove this square"
          onPress={() => {
            clearTile(cardId, cell);
            navigation.goBack();
          }}
          style={{ marginTop: space.sm }}
        />

        {authStatus === 'signedIn' && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownKicker}>PLAN</Text>
            {!breakdownLoading && (
              <TextInput
                value={planContext}
                onChangeText={handleContextChange}
                placeholder="Anything about your situation that'd help? (optional) e.g. skill level, budget, timeline — press return to research"
                placeholderTextColor={colors.inkFaint}
                style={[styles.input, styles.contextInput]}
                multiline
              />
            )}
            {steps.length === 0 ? (
              breakdownLoading ? (
                <View style={styles.breakdownLoading}>
                  <ActivityIndicator color={colors.ink} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lead}>Researching a plan…</Text>
                    <Text style={styles.hint}>
                      Can take up to a minute — it's actually looking things up, not just guessing. Feel free to
                      close this and keep using the app; come back and your plan will be waiting.
                    </Text>
                  </View>
                </View>
              ) : (
                <GhostButton label="🔍 Research a plan for this" onPress={() => refreshBreakdown(false, planContext)} />
              )
            ) : (
              <>
                {steps.map((step, i) => {
                  const isSelected = selectedStep === i;
                  const isEditing = editingStepIndex === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => !isEditing && setSelectedStep((s) => (s === i ? null : i))}
                      style={[styles.stepRow, isSelected && styles.stepRowSelected]}
                    >
                      <Pressable
                        onPress={() => toggleStepDone(i)}
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
                              value={editTitle}
                              onChangeText={setEditTitle}
                              style={styles.stepEditInput}
                              placeholder="Step title"
                              placeholderTextColor={colors.inkFaint}
                            />
                            <TextInput
                              value={editDetail}
                              onChangeText={setEditDetail}
                              style={[styles.stepEditInput, styles.stepEditDetailInput]}
                              placeholder="Detail"
                              placeholderTextColor={colors.inkFaint}
                              multiline
                            />
                            <View style={{ flexDirection: 'row', gap: space.sm }}>
                              <GhostButton label="Cancel" onPress={() => setEditingStepIndex(null)} style={{ flex: 1 }} />
                              <PrimaryButton label="Save" onPress={() => saveStepEdit(i)} style={{ flex: 1 }} />
                            </View>
                          </View>
                        ) : (
                          <>
                            <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{step.title}</Text>
                            {!!step.detail && (
                              <Text style={[styles.stepDetail, step.done && styles.stepDetailDone]}>{step.detail}</Text>
                            )}
                          </>
                        )}
                      </View>
                      {!isEditing && (
                        <Pressable onPress={() => beginStepEdit(i)} hitSlop={8} style={styles.stepEditIconWrap}>
                          <Text style={styles.stepEditIcon}>✎</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
                <GhostButton
                  label={breakdownLoading ? 'Trying again…' : '↻ Try again'}
                  onPress={() => refreshBreakdown(true, planContext)}
                  disabled={breakdownLoading}
                  style={{ marginTop: space.sm }}
                />
                {breakdownLoading && (
                  <Text style={[styles.hint, { marginTop: space.xs }]}>
                    Can take up to a minute — the steps above stay usable while the new plan researches.
                  </Text>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.sm },
  // flex: 1 (not a bare Text with no width constraint) is what actually fixes the clip —
  // without it a long tile label just keeps growing and pushes "Close" off the right
  // edge of the screen instead of wrapping within the space left for it.
  headerTitle: { flex: 1, marginRight: space.sm },
  close: { ...type.label, color: colors.inkSoft, paddingTop: 4 },
  lead: { ...type.body, color: colors.inkSoft, lineHeight: 20 },
  hint: { ...type.tiny, lineHeight: 15, marginTop: 2 },
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
  suggestionLabel: { ...type.h2, flex: 1 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  breakdownSection: { marginTop: space.xl },
  breakdownKicker: { ...type.kicker, marginBottom: space.sm },
  contextInput: { minHeight: 60, textAlignVertical: 'top', marginBottom: space.sm },
  breakdownLoading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
  stepRowSelected: { borderLeftColor: colors.stampGold, backgroundColor: colors.goldSoft },
  stepCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheckboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { ...type.h2, fontSize: 13, color: colors.inkSoft },
  stepNumSelected: { color: colors.goldInk },
  stepNumDone: { color: '#fff' },
  stepTitle: { ...type.body, fontWeight: '700', color: colors.ink },
  stepTitleDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  stepDetailDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  stepDetail: { ...type.tiny, marginTop: 2, lineHeight: 16 },
  stepEditIconWrap: { padding: 2 },
  stepEditIcon: { fontSize: 15, color: colors.inkFaint },
  stepEditInput: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.ink,
  },
  stepEditDetailInput: { minHeight: 44, textAlignVertical: 'top' },
});
