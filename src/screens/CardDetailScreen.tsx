import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInsight } from '../ai/useInsight';
import { FEATURES } from '../config/features';
import { cardSummary, isCardComplete, isTileCrossed, nearMissLines, radarStats, tileAt } from '../domain/logic';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { triumphHit } from '../feedback/haptics';
import { useApp } from '../state/AppStateContext';
import { CardTile, GhostButton, ProgressBar, cardLayout } from '../ui/components';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { colors, space, type } from '../ui/theme';
import { RadarChart } from '../ui/RadarChart';

/** A single card, opened from the dashboard. The grid and all the per-card detail
 *  (focus banner, bingo/crossed pills) live only here — the dashboard itself never
 *  shows any of it, by design (see CardDashboardScreen). */
export default function CardDetailScreen({ route, navigation }: any) {
  const cardId: string = route.params?.cardId;
  const { state, setFocusedTile, renameCard, deleteCard, shuffleCard } = useApp();
  const { width } = useWindowDimensions();
  const card = state.cards.find((c) => c.id === cardId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card?.title ?? '');
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
  // `Alert.alert` used to drive this confirmation — it's a documented no-op on
  // react-native-web (its whole implementation there is `static alert() {}`), so on web
  // the "Delete" button looked broken: the confirmation it was waiting on never
  // appeared, meaning its onPress (the one that actually calls deleteCard) never fired.
  // `ConfirmDialog` (built on `Modal`, which *is* implemented on web) replaces it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Same reasoning as delete above — a confirm step first, since shuffling is easy to
  // tap by accident and not something to undo casually once it's scrambled the grid.
  const [confirmingShuffle, setConfirmingShuffle] = useState(false);
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

  const confirmDelete = () => {
    deleteCard(cardId);
    setConfirmingDelete(false);
    // Not goBack(): CardDetail now sits two levels deep (Dashboard -> Today ->
    // CardDetail), so a single goBack() landed back on Today for the card that was
    // *just* deleted — Today's own "card not found" guard then tried to goBack() a
    // second time itself, and that double-pop is what was silently breaking the whole
    // delete action. popToTop() returns to the dashboard directly, in one step,
    // regardless of how deep the stack is.
    navigation.popToTop();
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
          {editingTitle ? (
            // `defaultValue`, not `value` — avoids the iOS-dictation duplicate-text bug a
            // controlled TextInput causes; safe since this whole field is behind
            // `editingTitle` and remounts fresh each time editing starts.
            <TextInput
              defaultValue={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={() => {
                setEditingTitle(false);
                renameCard(cardId, titleDraft);
              }}
              autoFocus
              selectTextOnFocus
              style={[type.quietCardTitle, { fontSize: 30 }, styles.titleInput]}
            />
          ) : (
            <Pressable
              onPress={() => {
                setTitleDraft(card.title);
                setEditingTitle(true);
              }}
              style={{ flex: 1 }}
            >
              <Text style={[type.quietCardTitle, { fontSize: 30 }]}>{card.title}</Text>
            </Pressable>
          )}
        </View>

        {focusedTile && !bannerDismissed && (
          // Not one big Pressable anymore — it used to double as the dismiss tap target
          // for the whole row, which would have swallowed (native) or double-fired (web,
          // where nested Pressables bubble like DOM clicks) a "View steps" button nested
          // inside it. Three explicit zones instead: label (inert), steps, dismiss.
          <View style={styles.focusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusBannerKicker}>FOCUS TILE</Text>
              <Text style={styles.focusBannerText} numberOfLines={1}>
                {focusedTile.emoji} {focusedTile.label}
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('TileEdit', { cardId, cell: focusedTile.cell })}
              hitSlop={8}
              style={styles.focusBannerSteps}
            >
              <Text style={styles.focusBannerStepsText}>View steps →</Text>
            </Pressable>
            <Pressable onPress={() => setBannerDismissed(true)} hitSlop={8}>
              <Text style={styles.focusBannerExit}>✕</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.statLine}>
          <ProgressBar pct={summary.total > 0 ? (summary.crossed / summary.total) * 100 : 0} color={colors.accentClay} height={5} />
          <Text style={styles.statLineText}>
            {summary.crossed}/{summary.total} crossed · {summary.bingos} bingo{summary.bingos === 1 ? '' : 's'}
            {complete ? ' · 🏆 Complete' : ''}
          </Text>
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
                  quiet
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

        {/* Shuffle moved down here, next to Delete — both are "a user could tap this by
            accident and not want the result" actions, so they're grouped and tucked below
            the everyday content (coach/stats) instead of sitting right under the grid
            where a stray tap is far more likely. Still has its own clear label and a
            confirm step, so it's tucked away without being hard to find. */}
        <View style={styles.dangerZone}>
          <Pressable style={styles.shuffleCard} onPress={() => setConfirmingShuffle(true)}>
            <Text style={styles.shuffleCardText}>🔀 Shuffle tiles</Text>
          </Pressable>
          <Pressable style={styles.deleteCard} onPress={() => setConfirmingDelete(true)}>
            <Text style={styles.deleteCardText}>🗑️ Delete this card</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmingShuffle}
        title="Shuffle this card's tiles?"
        message="Every filled square moves to a new spot on the grid. Nothing is added, removed, or crossed off — you can shuffle again as many times as you like."
        confirmLabel="Shuffle"
        onConfirm={() => {
          setConfirmingShuffle(false);
          shuffleCard(cardId);
        }}
        onCancel={() => setConfirmingShuffle(false)}
      />

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this card?"
        message={`"${card.title}" and everything on it will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

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
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
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
    backgroundColor: colors.accentClaySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  focusBannerKicker: { ...type.quietLabel, fontSize: 10, color: colors.accentClay, marginBottom: 1 },
  focusBannerText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  focusBannerSteps: { paddingHorizontal: space.sm },
  focusBannerStepsText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.accentClay },
  focusBannerExit: { fontSize: 15, fontWeight: '800', color: colors.inkQuietFaint, paddingHorizontal: space.xs },
  statLine: {
    alignSelf: 'stretch',
    gap: space.xs,
    marginTop: space.md,
    marginBottom: space.lg,
  },
  statLineText: { ...type.quietBody, fontSize: 12, color: colors.inkQuietFaint, textAlign: 'center' },
  gridWrap: { position: 'relative', alignSelf: 'center', marginBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  titleInput: { flex: 1, padding: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
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
  dangerZone: {
    alignSelf: 'stretch',
    marginTop: space.xxl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  shuffleCard: { alignSelf: 'center', paddingVertical: space.sm },
  shuffleCardText: { ...type.label, color: colors.inkFaint },
  deleteCard: {
    alignSelf: 'center',
    paddingVertical: space.sm,
  },
  deleteCardText: { ...type.label, color: colors.danger },
});
