import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isTileCrossed, tileAt } from '../domain/logic';
import { randomSuggestions } from '../domain/tileBank';
import { CENTER } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton } from '../ui/components';
import { categoryColor, colors, radius, space, type } from '../ui/theme';

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
});
