import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uid } from '../domain/logic';
import { type TileIdea } from '../domain/tileBank';
import { supabase } from '../lib/supabaseClient';
import { getPermission } from '../notifications/scheduler';
import { useApp } from '../state/AppStateContext';
import { CardReveal } from './CardReveal';
import CuratedBrowseScreen from './CuratedBrowseScreen';
import CustomDeckScreen from './CustomDeckScreen';
import SwipeDeckScreen from './SwipeDeckScreen';
import { PrimaryButton, Segmented } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Phase = 'intent' | 'deck' | 'reveal';
/** 'ai' stays in the union (never offered in the Segmented control below) only so a
 *  draft already persisted with that source from before AI research was replaced by
 *  "Customized" still type-checks when resumed — see DraftCard.source in domain/types.ts. */
type Source = 'bank' | 'ai' | 'custom';

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
 *  An "intent" phase before the deck lets the user name the card and choose how to fill
 *  it: the curated bank (default, swipe through pre-written ideas) or "Customized" (type
 *  every tile in by hand via CustomDeckScreen). This phase always shows now — neither
 *  option needs AI, so there's no feature flag gating it.
 *
 *  AI-researched decks (`source: 'ai'`, a `tilegen` Edge Function call — see
 *  supabase/functions/ai-insights) are no longer offered as a choice here (AI features
 *  are on hold for v1), but the generation code (`startGenerate`/`pollForResult`) is left
 *  intact below rather than deleted, and any draft/card from before this change that
 *  already has a generated `pool` still resumes and swipes through it exactly as before —
 *  only the *entry point* for starting a new one was removed. */
export default function CreateCardScreen({ navigation, route }: any) {
  const { state, createCard, saveDraftCard, clearDraftCard } = useApp();
  const [draftId] = useState<string>(() => route.params?.draftId ?? uid('draft'));
  const draft = state.draftCards.find((d) => d.id === draftId);
  const isGenerating = !!draft?.generating;
  const hasSwipeProgress = !!draft && draft.kept.length + draft.rejected.length > 0;
  const hasReadyPool = !isGenerating && !!draft?.pool?.length;
  const resuming = hasSwipeProgress || hasReadyPool;

  const [phase, setPhase] = useState<Phase>(() => (resuming ? 'deck' : 'intent'));
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

  // Every swipe already re-saves the draft via onProgress, so there's never anything to
  // lose by just leaving — no confirm dialog needed. This used to ask "save or discard?"
  // on every exit; now the header button's own label ("Save & finish later" once there's
  // real progress) already says what's about to happen, which is the confirmation.
  // Discarding a paused draft is still available, just from the dashboard's own
  // "Discard this draft" link on the draft row, not re-litigated on every close here.
  const closeDeck = () => {
    navigation.goBack();
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
            <Text style={[type.quietDisplay, { fontSize: 24 }]}>Still researching "{draft?.title || 'your card'}"…</Text>
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
              <Text style={[type.quietDisplay, { fontSize: 24 }]}>{title.trim() || 'New card'}</Text>
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
                  { value: 'custom', label: '✍️ Customized' },
                ]}
                value={source}
                onChange={(v) => {
                  setSource(v);
                  setGenError(null);
                }}
              />
              {source === 'custom' && (
                <Text style={styles.intentHint}>Type each tile in yourself — add as many as you like, aim for 24.</Text>
              )}
            </ScrollView>
            {/* Deliberately outside the ScrollView, not pinned via marginTop:'auto' inside
                it — the earlier version clipped this button entirely once the keyboard plus
                the intent textarea's content left less room than the column needed, since a
                plain flex column has nowhere to put overflow. A fixed footer below a
                scrollable region can't be pushed off-screen the same way. */}
            <View style={styles.intentFooter}>
              <PrimaryButton
                label={source === 'ai' ? 'Generate deck' : source === 'custom' ? 'Start typing' : 'Browse ideas'}
                tone="clay"
                onPress={() => (source === 'ai' ? startGenerate() : setPhase('deck'))}
                disabled={source === 'ai' && !intentText.trim()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // The card's name and the "save & finish later" exit both need to stay reachable for
  // as long as the deck phase is up — not just before it starts — since the user may
  // not have settled on a name yet, or may only realize partway through 24 tiles that
  // they need to step away. Committed on blur, same convention CardDetailScreen's own
  // tap-to-edit title already uses, rather than saving on every keystroke.
  const commitDeckTitle = () => {
    saveDraftCard(draftId, draft?.kept ?? [], draft?.rejected ?? [], draft?.usedSecondPass ?? false, {
      title: title.trim(),
      ...(pool ? { pool, intent: intentText.trim(), source: 'ai' } : source === 'custom' ? { source: 'custom' } : {}),
    });
  };

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.deckHeader}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={commitDeckTitle}
            placeholder="Name this card"
            placeholderTextColor={colors.inkFaint}
            style={styles.deckTitleInput}
          />
          {/* Always visible, not conditional on there being progress yet — every swipe/tile
              already autosaves, so this is always a true, safe thing to tap. */}
          <Pressable onPress={closeDeck} hitSlop={12} style={styles.deckSaveLink}>
            <Text style={styles.closeText}>💾 Save & finish later</Text>
          </Pressable>
        </View>
        {source === 'custom' ? (
          <CustomDeckScreen
            initialKept={draft?.kept}
            onProgress={(k) => saveDraftCard(draftId, k, [], false, { title: title.trim(), source: 'custom' })}
            onDone={(result) => {
              setKept(result);
              setPhase('reveal');
            }}
          />
        ) : pool ? (
          // A legacy already-researched AI pool from before that option was removed from
          // the Segmented control above — still swipeable exactly as before, so an old
          // in-progress draft doesn't break. Unreachable for any card started now.
          <SwipeDeckScreen
            customDeck={pool}
            initialKept={draft?.kept}
            initialRejected={draft?.rejected}
            initialUsedSecondPass={draft?.usedSecondPass}
            onProgress={(k, r, u) => saveDraftCard(draftId, k, r, u, { title: title.trim(), pool, intent: intentText.trim(), source: 'ai' })}
            onDone={(result) => {
              setKept(result);
              setPhase('reveal');
            }}
          />
        ) : (
          <CuratedBrowseScreen
            initialKept={draft?.kept}
            onProgress={(k) => saveDraftCard(draftId, k, [], false, { title: title.trim() })}
            onDone={(result) => {
              setKept(result);
              setPhase('reveal');
            }}
          />
        )}
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
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
  closeText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint },
  deckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  deckTitleInput: {
    flex: 1,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 6,
  },
  deckSaveLink: { flexShrink: 0 },
  intentContent: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  intentHint: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.inkSoft },
  titleInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
    color: colors.ink,
  },
  intentInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: colors.ink,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  intentFooter: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, alignItems: 'center' },
});
