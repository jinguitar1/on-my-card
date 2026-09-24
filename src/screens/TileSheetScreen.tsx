import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useInsight } from '../ai/useInsight';
import { useAuth } from '../auth/AuthContext';
import { isTileCrossed, tileAt } from '../domain/logic';
import { randomSuggestions } from '../domain/tileBank';
import { CENTER } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { categoryColor, colors, radius, space, type } from '../ui/theme';

interface BreakdownStep {
  title: string;
  detail: string;
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

export default function TileSheetScreen({ route, navigation }: any) {
  const cell: number = route.params?.cell ?? 0;
  const { state, setTile, setTileDone, clearTile } = useApp();
  const card = state.card;
  const tile = card ? tileAt(card, cell) : undefined;
  const isEmpty = !tile;

  const usedBankIds = useMemo(() => new Set((card?.tiles ?? []).map((t) => t.bankId).filter(Boolean) as string[]), [card]);
  const suggestions = useMemo(() => randomSuggestions(usedBankIds, 3), [usedBankIds]);

  const [typedLabel, setTypedLabel] = useState('');
  const [showTypeYourOwn, setShowTypeYourOwn] = useState(false);

  const { status: authStatus } = useAuth();
  const { insight: breakdown, loading: breakdownLoading, refresh: refreshBreakdown } = useInsight('breakdown', {
    tileId: tile?.id,
    auto: false,
  });
  const steps = useMemo(() => parseSteps(breakdown?.content), [breakdown]);

  if (!card || cell === CENTER) {
    navigation.goBack();
    return null;
  }

  const crossed = isTileCrossed(tile);

  const pick = (s: (typeof suggestions)[number]) => {
    setTile(cell, { label: s.label, emoji: s.emoji, note: s.note, category: s.category, bankId: s.id });
    navigation.goBack();
  };

  const saveTyped = () => {
    if (!typedLabel.trim()) return;
    setTile(cell, { label: typedLabel.trim() });
    navigation.goBack();
  };

  const swap = () => {
    const next = suggestions[0];
    if (!next) return;
    setTile(cell, { label: next.label, emoji: next.emoji, note: next.note, category: next.category, bankId: next.id });
    navigation.goBack();
  };

  if (isEmpty) {
    return (
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={type.h1}>Fill this square</Text>
            <Pressable onPress={() => navigation.goBack()}>
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
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={type.h1}>{tile!.emoji} {tile!.label}</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        {!!tile!.note && <Text style={styles.lead}>{tile!.note}</Text>}

        <PrimaryButton
          label={crossed ? 'Mark not done' : 'Cross it off'}
          tone={crossed ? 'danger' : 'gold'}
          onPress={() => {
            setTileDone(cell, !crossed);
            navigation.goBack();
          }}
          style={{ marginTop: space.xl }}
        />
        {!crossed && (
          <GhostButton label="Swap for a different idea" onPress={swap} style={{ marginTop: space.sm }} />
        )}
        <GhostButton
          danger
          label="Remove this square"
          onPress={() => {
            clearTile(cell);
            navigation.goBack();
          }}
          style={{ marginTop: space.sm }}
        />

        {authStatus === 'signedIn' && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownKicker}>PLAN</Text>
            {steps.length === 0 ? (
              breakdownLoading ? (
                <View style={styles.breakdownLoading}>
                  <ActivityIndicator color={colors.ink} />
                  <Text style={styles.lead}>Working out a plan…</Text>
                </View>
              ) : (
                <GhostButton label="🔍 Get a plan for this" onPress={() => refreshBreakdown()} />
              )
            ) : (
              <>
                {steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      {!!step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
                    </View>
                  </View>
                ))}
                <GhostButton
                  label={breakdownLoading ? 'Regenerating…' : 'Regenerate'}
                  onPress={() => refreshBreakdown(true)}
                  disabled={breakdownLoading}
                  style={{ marginTop: space.sm }}
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  close: { ...type.label, color: colors.inkSoft },
  lead: { ...type.body, color: colors.inkSoft, lineHeight: 20 },
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
  breakdownLoading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm, alignItems: 'flex-start' },
  stepNum: { ...type.h2, fontSize: 14, width: 20, color: colors.inkSoft },
  stepTitle: { ...type.body, fontWeight: '700', color: colors.ink },
  stepDetail: { ...type.tiny, marginTop: 2, lineHeight: 16 },
});
