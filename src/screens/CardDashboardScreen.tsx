import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { type DraftCard } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { colors, goalColor, radius, space, type } from '../ui/theme';

const DEFAULT_CARD_EMOJI = '🃏';

/** The Card tab's landing screen — a list of every card the user has built. Deliberately
 *  minimal on progress: each row shows only the title (plus a big personal emoji),
 *  nothing else (no focus tile / bingo count / crossed count) — those only appear once
 *  a specific card is actually opened (CardDetailScreen), so a glance at this list
 *  never leaks per-card progress. Rows lean bigger and warmer than a typical settings
 *  list, per "make the card pop more" — a large colored emoji circle (rotating through
 *  `goalColor`, the same per-card accent palette used elsewhere) and a bold serif
 *  title.
 *
 *  "+ Create a new card" is always available, regardless of how many drafts are already
 *  in progress — each draft in `state.draftCards` has its own id and its own status row
 *  below the finished-cards list, so an AI card researching in the background never
 *  blocks starting an independent second one (bank or AI) in the meantime. */
export default function CardDashboardScreen({ navigation }: any) {
  const { state, clearDraftCard } = useApp();
  const { status: authStatus } = useAuth();
  const showSyncBanner = authStatus === 'signedOut';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.quietDisplay, { fontSize: 32 }]}>Home</Text>

        {showSyncBanner && (
          <Pressable style={styles.banner} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.bannerText}>☁️ Back up your cards: sign in</Text>
            <Text style={styles.bannerArrow}>→</Text>
          </Pressable>
        )}

        {state.cards.length === 0 && state.draftCards.length === 0 ? (
          <Text style={styles.hint}>No cards yet. Create one below.</Text>
        ) : (
          <View style={{ gap: space.md, marginTop: space.lg }}>
            {state.cards.map((card, i) => (
              <Pressable
                key={card.id}
                style={styles.row}
                onPress={() => navigation.navigate('Today', { cardId: card.id })}
              >
                <View style={[styles.rowEmoji, { backgroundColor: goalColor(i) }]}>
                  <Text style={styles.rowEmojiText}>{card.emoji || DEFAULT_CARD_EMOJI}</Text>
                </View>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {card.title}
                </Text>
                <Text style={styles.rowArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        )}

        {state.draftCards.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            onOpen={() => navigation.navigate('CreateCard', { draftId: draft.id })}
            onDiscard={() => clearDraftCard(draft.id)}
          />
        ))}

        <Pressable style={styles.addCard} onPress={() => navigation.navigate('CreateCard')}>
          <Text style={styles.addCardText}>＋ Create a new card</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One draft's status row — researching / ready / failed / mid-swipe, each named for the
 *  specific card it is (falling back to "Untitled card" only if nothing was typed yet),
 *  so with more than one draft in flight it's always clear which is which. */
function DraftRow({ draft, onOpen, onDiscard }: { draft: DraftCard; onOpen: () => void; onDiscard: () => void }) {
  const name = draft.title?.trim() || 'Untitled card';
  const keptCount = draft.kept.length;
  const swipeProgress = keptCount + draft.rejected.length;
  // Confirmed before actually discarding — this used to fire immediately on tap, with
  // no way back if it was an accidental press and real swipe/typing progress was lost.
  const [confirming, setConfirming] = useState(false);
  const discardLink = (
    <>
      <Pressable style={styles.discardDraft} onPress={() => setConfirming(true)}>
        <Text style={styles.discardDraftText}>Discard this draft</Text>
      </Pressable>
      <ConfirmDialog
        visible={confirming}
        title="Discard this draft?"
        message={`"${name}" and everything kept so far will be deleted. This can't be undone.`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirming(false);
          onDiscard();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );

  if (draft.generating) {
    return (
      <Pressable
        style={styles.addCard}
        onPress={() => Alert.alert('Still researching', `"${name}" can take a minute or two. We'll let you know the moment it's ready.`)}
      >
        <Text style={styles.addCardText}>🔍 Researching "{name}"…</Text>
      </Pressable>
    );
  }

  if (draft.pool?.length && swipeProgress === 0) {
    return (
      <Pressable style={[styles.addCard, styles.addCardReady]} onPress={onOpen}>
        <Text style={[styles.addCardText, styles.addCardReadyText]}>✨ "{name}" is ready. Tap to start swiping.</Text>
      </Pressable>
    );
  }

  if (draft.genError && !draft.pool?.length) {
    return (
      <>
        <Pressable style={[styles.addCard, styles.addCardError]} onPress={onOpen}>
          <Text style={[styles.addCardText, styles.addCardErrorText]}>⚠️ Couldn't research "{name}". Tap to try again.</Text>
        </Pressable>
        {discardLink}
      </>
    );
  }

  // Styled like a finished card's own row (same emoji circle, same title) rather than
  // the dashed "add card" placeholder it used to share — so a saved-and-returned-to-
  // later draft reads as "this is clearly one of my cards, just not done yet," not as a
  // totally different, lesser kind of thing.
  //
  // That similarity turned out to be too close: confirmed from a screen recording, a
  // real card ("Jin's curated ideas 2") and a near-empty draft ("Jin's customized ideas
  // 2," 0/24 kept) sat in the same list looking close enough alike that tapping the
  // draft (which correctly reopens card creation) read as "an unfinished real card is
  // taking me to the wrong place" — it wasn't a routing bug, the draft just didn't look
  // different enough from a real card to explain what it actually was. Now: a dashed
  // (not solid) border in the accent color, same visual language the "+ Create a new
  // card" placeholder already uses for "this isn't a finished thing yet," a loud
  // pill-style "DRAFT" badge next to the title instead of small gray subtext underneath
  // it, and a ↻ (resume) arrow instead of the real-card list's → (open) — three
  // independent cues now, not one.
  //
  // This used to require `swipeProgress > 0` and render nothing at all for a draft with
  // zero tiles kept so far — meaning naming a brand-new card and tapping "Save & finish
  // later" before adding a single tile looked exactly like it hadn't saved anything: the
  // draft genuinely was persisted (saveDraftCard fires on mount, before any tile is
  // added), there was just no visible row for it anywhere. Any draft that reaches this
  // point (not generating, no ready AI pool, no error) is resumable regardless of
  // progress, so it always gets a row now.
  return (
    <>
      <Pressable style={[styles.row, styles.draftRow]} onPress={onOpen}>
        <View style={[styles.rowEmoji, styles.draftRowEmoji]}>
          <Text style={styles.rowEmojiText}>{DEFAULT_CARD_EMOJI}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.draftTitleRow}>
            <Text style={styles.draftPill}>DRAFT</Text>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={styles.draftBadge}>{keptCount}/24 kept so far</Text>
        </View>
        <Text style={styles.draftResumeArrow}>↻</Text>
      </Pressable>
      {discardLink}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  hint: { ...type.tiny, marginTop: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.accentClaySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  bannerText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.accentClay },
  bannerArrow: { fontSize: 15, fontWeight: '800', color: colors.accentClay, paddingHorizontal: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  rowEmoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowEmojiText: { fontSize: 19 },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.ink, flex: 1 },
  rowArrow: { fontSize: 16, fontWeight: '800', color: colors.inkQuietFaint },
  draftRow: { marginTop: space.md, opacity: 0.7, borderStyle: 'dashed', borderColor: colors.accentClay },
  draftRowEmoji: { backgroundColor: colors.inkQuietFaint },
  draftTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  draftPill: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.accentClay,
    backgroundColor: colors.accentClaySoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  draftBadge: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: colors.inkQuietFaint, marginTop: 2 },
  draftResumeArrow: { fontSize: 18, fontWeight: '800', color: colors.accentClay },
  addCard: {
    marginTop: space.lg,
    borderWidth: 1.5,
    borderColor: colors.lineQuiet,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  addCardText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint },
  addCardReady: { borderStyle: 'solid', borderColor: colors.accentClay, backgroundColor: colors.accentClaySoft },
  addCardReadyText: { color: colors.accentClay },
  addCardError: { borderStyle: 'solid', borderColor: colors.danger },
  addCardErrorText: { color: colors.danger },
  discardDraft: { marginTop: space.sm, alignItems: 'center' },
  discardDraftText: { ...type.tiny },
});
