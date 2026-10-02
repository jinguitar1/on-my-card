import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInsight } from '../ai/useInsight';
import { FEATURES } from '../config/features';
import { cardSummary, isCardComplete, isTileCrossed, nearMissLines, radarStats, tileAt } from '../domain/logic';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { triumphHit } from '../feedback/haptics';
import { useApp } from '../state/AppStateContext';
import { CardTile, GhostButton, Pill, cardLayout } from '../ui/components';
import { colors, space, type } from '../ui/theme';
import { RadarChart } from '../ui/RadarChart';

/** A single card, opened from the dashboard. The grid and all the per-card detail
 *  (focus banner, bingo/crossed pills) live only here — the dashboard itself never
 *  shows any of it, by design (see CardDashboardScreen). */
export default function CardDetailScreen({ route, navigation }: any) {
  const cardId: string = route.params?.cardId;
  const { state, setFocusedTile, renameCard, setCardEmoji, deleteCard } = useApp();
  const { width } = useWindowDimensions();
  const card = state.cards.find((c) => c.id === cardId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card?.title ?? '');
  const [editingEmoji, setEditingEmoji] = useState(false);
  const [emojiDraft, setEmojiDraft] = useState(card?.emoji ?? '');
  // ✕ on the focus banner dismisses the banner *and* stops the tunnel-vision dimming —
  // every tile goes back to normal so the rest of the card is visible again, but the
  // focused tile keeps its own glow + a small ★ badge (CardTile's `isFocused`) so it's
  // still easy to spot at a glance. Actually clearing focus stays a deliberate action
  // from that tile's own sheet ("★ Focused — tap to unfocus"), not a stray tap here.
  // Local/session-only: reopening this card shows the banner (and dimming) again.
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // AI coach and stats are tucked away for v1 — see src/config/features.ts. `auto: false`
  // stops this from auto-fetching (and burning a cached-per-day Claude call) while hidden.
  const { insight: nudge, loading: nudgeLoading, refresh: refreshNudge } = useInsight('nudge', { auto: FEATURES.aiCoach });

  const [showRadar, setShowRadar] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const gridAnim = useRef(new Animated.Value(0)).current;

  const gridW = Math.min(width - space.lg * 2, 460);
  const layout = useMemo(() => cardLayout(gridW), [gridW]);

  // The grid still gets its spring-in entrance — now fired once on arrival from the
  // dashboard instead of an explicit "open" tap, since navigating here already means
  // "opened."
  useEffect(() => {
    if (!card) return;
    triumphHit();
    setConfettiTrigger((c) => c + 1);
    Animated.spring(gridAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 70 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!card) {
    navigation.goBack();
    return null;
  }

  const summary = cardSummary(card);
  const complete = isCardComplete(card);
  const radar = radarStats(card);
  const focusedTile = card.tiles.find((t) => t.id === card.focusedTileId);
  const nearMiss = new Map(nearMissLines(card).map((n) => [n.missingCell, colors.stampGold]));

  const handleDelete = () => {
    Alert.alert(
      'Delete this card?',
      `"${card.title}" and everything on it will be permanently deleted. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCard(cardId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Home</Text>
        </Pressable>

        <View style={styles.titleRow}>
          {editingEmoji ? (
            <TextInput
              value={emojiDraft}
              onChangeText={setEmojiDraft}
              onBlur={() => {
                setEditingEmoji(false);
                setCardEmoji(cardId, emojiDraft);
              }}
              autoFocus
              selectTextOnFocus
              style={styles.emojiInput}
            />
          ) : (
            <Pressable
              onPress={() => {
                setEmojiDraft(card.emoji ?? '');
                setEditingEmoji(true);
              }}
              style={styles.emojiTap}
            >
              <Text style={styles.emojiTapText}>{card.emoji || '＋'}</Text>
            </Pressable>
          )}

          {editingTitle ? (
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={() => {
                setEditingTitle(false);
                renameCard(cardId, titleDraft);
              }}
              autoFocus
              selectTextOnFocus
              style={[type.display, styles.titleInput]}
            />
          ) : (
            <Pressable
              onPress={() => {
                setTitleDraft(card.title);
                setEditingTitle(true);
              }}
              style={{ flex: 1 }}
            >
              <Text style={type.display}>{card.title}</Text>
            </Pressable>
          )}
        </View>

        {focusedTile && !bannerDismissed && (
          <Pressable style={styles.focusBanner} onPress={() => setBannerDismissed(true)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusBannerKicker}>FOCUS TILE</Text>
              <Text style={styles.focusBannerText} numberOfLines={1}>
                {focusedTile.emoji} {focusedTile.label}
              </Text>
            </View>
            <Text style={styles.focusBannerExit}>✕</Text>
          </Pressable>
        )}

        <View style={styles.statRow}>
          <Pill text={`${summary.bingos} bingo${summary.bingos === 1 ? '' : 's'}`} tone="ink" />
          <Pill text={`${summary.crossed}/${summary.total} crossed`} tone="neutral" />
          {complete && <Pill text="🏆 Complete" tone="success" />}
        </View>

        <Animated.View
          style={[
            styles.gridWrap,
            { width: gridW, height: gridW },
            {
              opacity: gridAnim,
              transform: [{ scale: gridAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}
        >
          {Array.from({ length: CELL_COUNT }).map((_, cell) => {
            const r = Math.floor(cell / GRID);
            const c = cell % GRID;
            const stylePos = { position: 'absolute' as const, left: layout.pos(c), top: layout.pos(r) };
            if (cell === CENTER) {
              return (
                <View key={cell} style={stylePos}>
                  <CardTile isCenter size={layout.cell} />
                </View>
              );
            }
            const tile = tileAt(card, cell);
            const crossed = isTileCrossed(tile);
            const focused = !!tile && card.focusedTileId === tile.id;
            // The tunnel-vision dimming is tied to the banner being up, not to focus
            // existing at all — dismissing the banner (✕) brings every other tile back
            // to normal, but the focused tile keeps its own marker regardless (below),
            // so it's still easy to spot in the full, undimmed grid.
            const dimmed = !!card.focusedTileId && !bannerDismissed && !focused;
            return (
              <View key={cell} style={[stylePos, dimmed && styles.dimmed, focused && styles.focused]}>
                <CardTile
                  size={layout.cell}
                  isFocused={focused}
                  label={tile?.label ?? '＋'}
                  emoji={tile?.emoji}
                  crossed={crossed}
                  oneAwayColor={!crossed ? nearMiss.get(cell) : undefined}
                  onPress={() => navigation.navigate('TileSheet', { cell, cardId })}
                />
              </View>
            );
          })}
        </Animated.View>

        {FEATURES.aiCoach &&
          (showCoach ? (
            <>
              {nudge ? (
                <View style={styles.coach}>
                  <View style={styles.coachHeaderRow}>
                    <Text style={styles.coachKicker}>COACH</Text>
                    <View style={{ flexDirection: 'row', gap: space.md }}>
                      {__DEV__ && (
                        <Pressable onPress={() => refreshNudge(true)}>
                          <Text style={styles.coachDevRefresh}>↻ regenerate</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => setShowCoach(false)}>
                        <Text style={styles.coachDevRefresh}>Hide</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.coachText}>{nudge.content}</Text>
                </View>
              ) : (
                nudgeLoading && (
                  <View style={styles.coach}>
                    <Text style={styles.coachKicker}>COACH</Text>
                    <Text style={styles.coachText}>Getting your coaching nudge…</Text>
                  </View>
                )
              )}
            </>
          ) : (
            <CoachTriggerButton onPress={() => setShowCoach(true)} ready={!!nudge} />
          ))}

        {FEATURES.stats && (
          <>
            <GhostButton
              label={showRadar ? 'Hide my stats' : '📊 View my stats'}
              onPress={() => setShowRadar((v) => !v)}
              style={{ marginTop: space.lg }}
            />
            {showRadar && <RadarChart data={radar} focusedCategory={focusedTile?.category} />}
          </>
        )}

        <Pressable style={styles.deleteCard} onPress={handleDelete}>
          <Text style={styles.deleteCardText}>🗑️ Delete this card</Text>
        </Pressable>
      </ScrollView>

      <Confetti trigger={confettiTrigger} intensity="burst" accent={colors.stampGold} />
    </SafeAreaView>
  );
}

/** A personified stand-in for the coach box while it's tucked away — a small avatar
 *  that gently pulses (alive, not a flat button) with a gold "ready" dot once a nudge
 *  has actually finished loading, so there's a reason to go tap it. */
function CoachTriggerButton({ onPress, ready }: { onPress: () => void; ready: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });

  return (
    <Pressable onPress={onPress} style={styles.coachTrigger}>
      <Animated.View style={[styles.coachAvatar, { transform: [{ scale }] }]}>
        <Text style={styles.coachAvatarEmoji}>🧑‍🏫</Text>
        {ready && <View style={styles.coachAvatarDot} />}
      </Animated.View>
      <Text style={styles.coachTriggerText}>Ask your coach</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, alignItems: 'center' },
  backLink: { alignSelf: 'flex-start', marginBottom: space.sm },
  backLinkText: { ...type.label, color: colors.inkSoft },
  coach: {
    alignSelf: 'stretch',
    backgroundColor: colors.cardSunk,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.lg,
  },
  coachKicker: { ...type.kicker, fontSize: 10, marginBottom: 2 },
  coachHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachDevRefresh: { ...type.tiny, color: colors.success },
  coachText: { fontSize: 13, lineHeight: 18, color: colors.ink, fontWeight: '600' },
  coachTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    marginTop: space.lg,
    backgroundColor: colors.cardSunk,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarEmoji: { fontSize: 18 },
  coachAvatarDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.stampGold,
    borderWidth: 1.5,
    borderColor: colors.paper,
  },
  coachTriggerText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  focusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.stampGold,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  focusBannerKicker: { ...type.kicker, fontSize: 10, color: colors.crossInk, opacity: 0.7, marginBottom: 1 },
  focusBannerText: { fontSize: 14, fontWeight: '800', color: colors.crossInk },
  focusBannerExit: { fontSize: 15, fontWeight: '800', color: colors.crossInk, paddingHorizontal: space.xs },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    alignSelf: 'stretch',
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  gridWrap: { position: 'relative', alignSelf: 'center', marginBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  titleInput: { flex: 1, padding: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
  emojiTap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiTapText: { fontSize: 22, color: colors.inkFaint },
  emojiInput: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 20,
    textAlign: 'center',
    padding: 0,
  },
  // Focus mode: the unfocused majority recedes hard (near-invisible + slightly
  // shrunk) rather than just faded, so the one focused tile reads as a genuine
  // spotlight/tunnel-vision effect instead of a subtle dim.
  dimmed: { opacity: 0.15, transform: [{ scale: 0.92 }] },
  focused: {
    shadowColor: colors.stampGold,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  deleteCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: space.xxl,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  deleteCardText: { ...type.label, color: colors.danger },
});
