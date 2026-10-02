import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FEATURES } from '../config/features';
import { uid } from '../domain/logic';
import { type TileIdea } from '../domain/tileBank';
import { supabase } from '../lib/supabaseClient';
import { getPermission } from '../notifications/scheduler';
import { useApp } from '../state/AppStateContext';
import { CardReveal } from './CardReveal';
import SwipeDeckScreen from './SwipeDeckScreen';
import { PrimaryButton, Segmented } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Phase = 'intent' | 'deck' | 'reveal';
type Source = 'bank' | 'ai';

interface TilegenResult {
  tiles: { emoji: string; label: string; note: string }[];
}

/** Building an additional card from the dashboard's "+ Create a new card" button — the
 *  same swipe-deck mechanic as first-run onboarding, minus the welcome/intro phases
 *  (the user already knows the gesture; SwipeDeckScreen's own persistent reminder is
 *  enough on a repeat visit). Saving returns to the dashboard, where the new card is
 *  now in the list — the "ta-da" moment already happened on the reveal screen.
 *
 *  Resumable, and independent of any other draft in progress: `route.params.draftId`
 *  identifies which entry in `state.draftCards` this session is — the dashboard passes
 *  an existing draft's id when resuming/viewing it, and passes none at all for a brand
 *  new card, in which case one is minted here immediately. Because each draft carries
 *  its own id, starting (or resuming) one never touches any other draft's state — in
 *  particular, starting a second card while a first is still being AI-researched in the
 *  background is always safe, which a single shared "current draft" slot could not
 *  guarantee (see DraftCard's own comment for why this is a list).
 *
 *  Behind FEATURES.aiCardGen: an "intent" phase before the deck lets the user either
 *  keep the original curated-bank flow (default, unchanged) or describe what this card
 *  is for and have a `tilegen` Edge Function call (see supabase/functions/ai-insights)
 *  research it and generate a deck instead — fed into the exact same SwipeDeckScreen via
 *  its `customDeck` prop, so nothing downstream of the deck needed to change. With the
 *  flag off, this screen behaves identically to before (straight to the deck). */
export default function CreateCardScreen({ navigation, route }: any) {
  const { state, createCard, saveDraftCard, clearDraftCard } = useApp();
  const [draftId] = useState<string>(() => route.params?.draftId ?? uid('draft'));
  const draft = state.draftCards.find((d) => d.id === draftId);
  const isGenerating = !!draft?.generating;
  const hasSwipeProgress = !!draft && draft.kept.length + draft.rejected.length > 0;
  const hasReadyPool = !isGenerating && !!draft?.pool?.length;
  const resuming = hasSwipeProgress || hasReadyPool;

  const [phase, setPhase] = useState<Phase>(() => (resuming ? 'deck' : FEATURES.aiCardGen ? 'intent' : 'deck'));
  const [kept, setKept] = useState<TileIdea[]>([]);

  const [title, setTitle] = useState(draft?.title ?? '');
  const [source, setSource] = useState<Source>(draft?.source ?? 'bank');
  const [intentText, setIntentText] = useState(draft?.intent ?? '');
  const [pool, setPool] = useState<TileIdea[] | undefined>(draft?.pool);
  const [genError, setGenError] = useState<string | null>(draft?.genError ?? null);

  async function notifyOutcome(title: string, body: string) {
    const granted = await getPermission();
    if (!granted) return;
    try {
      await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    } catch {
      // best-effort — the dashboard banner (driven by draftCards, already saved by the
      // time this would fire) is the real source of truth regardless of whether this
      // actually shows up as a system notification.
    }
  }

  // A *client-side* network error (dropped connection, request timeout) is not the same
  // thing as the function actually failing — confirmed in practice: generation routinely
  // takes a few minutes, well past the ~60s default request timeout iOS's networking
  // stack applies, but the Edge Function itself keeps running server-side after the
  // client gives up and writes its result to ai_insights regardless. Without this, the
  // app told the user it failed while the real answer showed up a few minutes later
  // with no way to know — a false "it broke" that was actually just "still cooking."
  // Only called on a true network-level error, never on a clean error *response* from
  // the function (400/404/429/502), since those mean the server definitely already
  // gave its final answer and there's nothing further to wait for.
  async function pollForResult(forDraftId: string): Promise<TilegenResult | null> {
    const deadline = Date.now() + 4 * 60_000;
    const intervalMs = 10_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const { data } = await supabase.from('ai_insights').select('content').eq('kind', 'tilegen').eq('period', forDraftId).maybeSingle();
      if (data?.content) {
        try {
          const parsed = JSON.parse(data.content) as TilegenResult;
          if (parsed.tiles?.length) return parsed;
        } catch {
          // keep polling — a row existing with unparseable content shouldn't happen,
          // but isn't a reason to give up before the deadline either
        }
      }
    }
    return null;
  }

  // Deliberately fire-and-forget: a web-search-augmented, 24-30-tile generation
  // routinely takes a minute or more, and there's no good reason to make the user sit on
  // this screen for it. `saveDraftCard` is a stable context function and `notifyOutcome`
  // only touches module-level APIs, so both remain safe to call once this resolves
  // whether or not CreateCardScreen itself is still mounted by then — the result (or
  // error) lands in global state, keyed by this session's own `draftId`, either way.
  function startGenerate() {
    const intent = intentText.trim();
    if (!intent) return;
    setGenError(null);
    const cardTitle = title.trim();
    saveDraftCard(draftId, [], [], false, { title: cardTitle, intent, source: 'ai', generating: true });

    function succeed(parsed: TilegenResult) {
      const tiles: TileIdea[] = parsed.tiles.map((t) => ({ id: uid('ai'), emoji: t.emoji, label: t.label, note: t.note }));
      saveDraftCard(draftId, [], [], false, { title: cardTitle, pool: tiles, intent, source: 'ai', generating: false });
      void notifyOutcome(
        'Your card is ready!',
        `${cardTitle || 'Your researched card'}: ${tiles.length} ideas are ready to swipe through — tap to continue.`
      );
    }

    function fail(message: string) {
      saveDraftCard(draftId, [], [], false, { title: cardTitle, intent, source: 'ai', generating: false, genError: message });
      void notifyOutcome(
        'Card research failed',
        `Couldn't research "${cardTitle || 'your card'}" — tap to try again.`
      );
    }

    (async () => {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { kind: 'tilegen', intent, draftId, force: false },
      });
      if (error) {
        const polled = await pollForResult(draftId);
        if (polled) {
          succeed(polled);
        } else {
          fail('Could not generate right now — try again.');
        }
        return;
      }
      if (data?.error) {
        fail(data.error === 'try again in a moment' ? 'Try again in a moment.' : 'Could not generate right now — try again.');
        return;
      }
      const parsed = JSON.parse(data.insight.content) as TilegenResult;
      if (!parsed.tiles.length) {
        fail('Came back empty — try adding a bit more detail and generating again.');
        return;
      }
      succeed(parsed);
    })();

    Alert.alert(
      'Researching your card',
      "This can take a minute or two. Feel free to close this and browse your other cards — we'll let you know the moment it's ready.",
      [{ text: 'Got it', onPress: () => navigation.goBack() }]
    );
  }

  // Nothing kept or rejected yet means there's no real progress to protect — close
  // immediately rather than asking about a draft that would just be empty anyway.
  const closeDeck = () => {
    const keptCount = draft?.kept.length ?? 0;
    const rejectedCount = draft?.rejected.length ?? 0;
    if (keptCount + rejectedCount === 0) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Save as draft?',
      `You've kept ${keptCount} tile${keptCount === 1 ? '' : 's'} so far. Save this as a draft to pick up later, or discard it?`,
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { clearDraftCard(draftId); navigation.goBack(); } },
        { text: 'Save draft', onPress: () => navigation.goBack() },
      ]
    );
  };

  if (phase === 'intent') {
    // Re-entering this screen while a previously-started generation is still running
    // (e.g. tapped back in from the dashboard's "Researching..." row) — show status
    // instead of a second "Generate deck" form that would kick off a duplicate request.
    if (isGenerating) {
      return (
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.intentContent}>
            <Text style={type.h1}>Still researching "{draft?.title || 'your card'}"…</Text>
            <Text style={styles.intentHint}>
              This can take a minute or two. Feel free to close this and browse your other cards — we'll let you know
              the moment it's ready.
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.intentContent}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
            >
              <Text style={type.h1}>{title.trim() || 'New card'}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Name this card"
                placeholderTextColor={colors.inkFaint}
                style={styles.titleInput}
              />
              <Text style={styles.intentHint}>How do you want to fill this one?</Text>
              <Segmented
                options={[
                  { value: 'bank', label: 'Curated ideas' },
                  { value: 'ai', label: '🔍 Research this' },
                ]}
                value={source}
                onChange={(v) => {
                  setSource(v);
                  setGenError(null);
                }}
              />
              {source === 'ai' && (
                <>
                  <Text style={styles.intentHint}>
                    What's this card for? A trip, an event, a goal — the more specific, the better the ideas.
                  </Text>
                  <TextInput
                    value={intentText}
                    onChangeText={setIntentText}
                    placeholder="Describe what this card is for..."
                    placeholderTextColor={colors.inkFaint}
                    style={styles.intentInput}
                    multiline
                  />
                  {genError && <Text style={styles.error}>{genError}</Text>}
                </>
              )}
            </ScrollView>
            {/* Deliberately outside the ScrollView, not pinned via marginTop:'auto' inside
                it — the earlier version clipped this button entirely once the keyboard plus
                the intent textarea's content left less room than the column needed, since a
                plain flex column has nowhere to put overflow. A fixed footer below a
                scrollable region can't be pushed off-screen the same way. */}
            <View style={styles.intentFooter}>
              <PrimaryButton
                label={source === 'ai' ? 'Generate deck' : 'Start swiping'}
                onPress={() => (source === 'ai' ? startGenerate() : setPhase('deck'))}
                disabled={source === 'ai' && !intentText.trim()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={closeDeck} hitSlop={12}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <SwipeDeckScreen
          customDeck={pool}
          initialKept={draft?.kept}
          initialRejected={draft?.rejected}
          initialUsedSecondPass={draft?.usedSecondPass}
          onProgress={(k, r, u) =>
            saveDraftCard(draftId, k, r, u, pool ? { title: title.trim(), pool, intent: intentText.trim(), source: 'ai' } : { title: title.trim() })
          }
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
      defaultTitle={title.trim() || `My ${new Date().getFullYear()} Card`}
      ctaLabel="Add to my cards"
      onSave={(title) => {
        createCard(
          kept.map((t) => ({ label: t.label, emoji: t.emoji, note: t.note, category: t.category, bankId: t.id })),
          title,
          undefined,
          pool ? intentText.trim() : undefined
        );
        clearDraftCard(draftId);
        navigation.goBack();
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
  closeText: { ...type.label, color: colors.inkSoft },
  intentContent: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  intentHint: { ...type.body, color: colors.inkSoft },
  titleInput: {
    backgroundColor: colors.cardSunk,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  intentInput: {
    backgroundColor: colors.cardSunk,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  intentFooter: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, alignItems: 'center' },
});
