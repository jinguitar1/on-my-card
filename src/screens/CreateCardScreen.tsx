import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TileIdea } from '../domain/tileBank';
import { useApp } from '../state/AppStateContext';
import { CardReveal } from './CardReveal';
import SwipeDeckScreen from './SwipeDeckScreen';
import { colors, space, type } from '../ui/theme';

type Phase = 'deck' | 'reveal';

/** Building an additional card from the dashboard's "+ Create a new card" button — the
 *  same swipe-deck mechanic as first-run onboarding, minus the welcome/intro phases
 *  (the user already knows the gesture; SwipeDeckScreen's own persistent reminder is
 *  enough on a repeat visit). Saving returns to the dashboard, where the new card is
 *  now in the list — the "ta-da" moment already happened on the reveal screen.
 *
 *  Resumable: if `state.draftCard` has an in-progress session (the dashboard only
 *  routes here with one present when its own "Continue creating your card" button was
 *  tapped), it seeds `SwipeDeckScreen`'s initial kept/rejected/usedSecondPass instead of
 *  starting fresh. Every swipe decision re-saves the draft via `onProgress` — tapping
 *  Close mid-deck is a deliberate pause, not a discard, so it does *not* clear it. */
export default function CreateCardScreen({ navigation }: any) {
  const { state, createCard, saveDraftCard, clearDraftCard } = useApp();
  const draft = state.draftCard;
  const [phase, setPhase] = useState<Phase>('deck');
  const [kept, setKept] = useState<TileIdea[]>([]);

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <SwipeDeckScreen
          initialKept={draft?.kept}
          initialRejected={draft?.rejected}
          initialUsedSecondPass={draft?.usedSecondPass}
          onProgress={(k, r, u) => saveDraftCard(k, r, u)}
          onDone={(result) => {
            setKept(result);
            setPhase('reveal');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <CardReveal
      kept={kept}
      defaultTitle={`My ${new Date().getFullYear()} Card`}
      ctaLabel="Add to my cards"
      onSave={(title, emoji) => {
        createCard(
          kept.map((t) => ({ label: t.label, emoji: t.emoji, note: t.note, category: t.category, bankId: t.id })),
          title,
          emoji
        );
        clearDraftCard();
        navigation.goBack();
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.sm },
  closeText: { ...type.label, color: colors.inkSoft },
});
