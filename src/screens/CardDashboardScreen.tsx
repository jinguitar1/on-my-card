import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { type DraftCard } from '../domain/types';
import { useApp } from '../state/AppStateContext';
import { colors, goalColor, radius, shadow, space, type } from '../ui/theme';

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
        <Text style={type.display}>Home</Text>

        {showSyncBanner && (
          <Pressable style={styles.banner} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.bannerText}>☁️ Back up your cards — sign in</Text>
            <Text style={styles.bannerArrow}>→</Text>
          </Pressable>
        )}

        {state.cards.length === 0 && state.draftCards.length === 0 ? (
          <Text style={styles.hint}>No cards yet — create one below.</Text>
        ) : (
          <View style={{ gap: space.md, marginTop: space.lg }}>
            {state.cards.map((card, i) => (
              <Pressable
                key={card.id}
                style={styles.row}
                onPress={() => navigation.navigate('CardDetail', { cardId: card.id })}
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

  if (draft.generating) {
    return (
      <Pressable
        style={styles.addCard}
        onPress={() => Alert.alert('Still researching', `"${name}" can take a minute or two — we'll let you know the moment it's ready.`)}
      >
        <Text style={styles.addCardText}>🔍 Researching "{name}"…</Text>
      </Pressable>
    );
  }

  if (draft.pool?.length && swipeProgress === 0) {
    return (
      <Pressable style={[styles.addCard, styles.addCardReady]} onPress={onOpen}>
        <Text style={[styles.addCardText, styles.addCardReadyText]}>✨ "{name}" is ready — tap to start swiping</Text>
      </Pressable>
    );
  }

  if (draft.genError && !draft.pool?.length) {
    return (
      <>
        <Pressable style={[styles.addCard, styles.addCardError]} onPress={onOpen}>
          <Text style={[styles.addCardText, styles.addCardErrorText]}>⚠️ Couldn't research "{name}" — tap to try again</Text>
        </Pressable>
        <Pressable style={styles.discardDraft} onPress={onDiscard}>
          <Text style={styles.discardDraftText}>Discard this draft</Text>
        </Pressable>
      </>
    );
  }

  if (swipeProgress > 0) {
    return (
      <>
        <Pressable style={styles.addCard} onPress={onOpen}>
          <Text style={styles.addCardText}>
            ↻ Continue "{name}" ({keptCount}/24 kept)
          </Text>
        </Pressable>
        <Pressable style={styles.discardDraft} onPress={onDiscard}>
          <Text style={styles.discardDraftText}>Discard this draft</Text>
        </Pressable>
      </>
    );
  }

  // A draft with nothing in it yet (e.g. the intent screen was opened and closed
  // immediately) — shouldn't normally persist, but render nothing rather than a
  // confusing empty-looking row if it ever does.
  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  hint: { ...type.tiny, marginTop: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  bannerText: { fontSize: 13, fontWeight: '700', color: colors.goldInk },
  bannerArrow: { fontSize: 15, fontWeight: '800', color: colors.goldInk, paddingHorizontal: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    gap: space.md,
    ...shadow.card,
  },
  rowEmoji: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  rowEmojiText: { fontSize: 26 },
  rowTitle: { ...type.h1, fontSize: 20, flex: 1 },
  rowArrow: { fontSize: 18, fontWeight: '800', color: colors.inkFaint },
  addCard: {
    marginTop: space.lg,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  addCardText: { ...type.label, color: colors.inkSoft },
  addCardReady: { borderStyle: 'solid', borderColor: colors.stampGold, backgroundColor: colors.goldSoft },
  addCardReadyText: { color: colors.goldInk },
  addCardError: { borderStyle: 'solid', borderColor: colors.danger },
  addCardErrorText: { color: colors.danger },
  discardDraft: { marginTop: space.sm, alignItems: 'center' },
  discardDraftText: { ...type.tiny },
});
