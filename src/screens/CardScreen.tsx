import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInsight } from '../ai/useInsight';
import { useAuth } from '../auth/AuthContext';
import { cardSummary, completedLines, isTileCrossed, nearMissLines, nextReward, tileAt } from '../domain/logic';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { bingoHit, lightTap, stampHit, triumphHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { useApp } from '../state/AppStateContext';
import { BingoRail, CardTile, Pill, cardLayout } from '../ui/components';
import { colors, space, type } from '../ui/theme';

export default function CardScreen({ navigation }: any) {
  const { state, pressTile } = useApp();
  const { status: authStatus } = useAuth();
  const sound = useSound();
  const { width } = useWindowDimensions();
  const card = state.card;

  // Always visible while signed out — no dismiss. A one-time-dismissible banner is
  // exactly how people lost track of sign-in before; this is the one screen everyone
  // opens every time, so it's the one place this can't go missing.
  const showSyncBanner = authStatus === 'signedOut';

  const { insight: nudge } = useInsight('nudge');

  const gridW = Math.min(width - space.lg * 2, 460);
  const layout = useMemo(() => cardLayout(gridW), [gridW]);

  const [stampKeys, setStampKeys] = useState<Record<number, number>>({});
  const [confetti, setConfetti] = useState(0);
  const confettiAccent = useRef<string>(colors.stampGold);

  if (!card) return null;

  const summary = cardSummary(card);
  const nextRw = nextReward(card);
  const bingoLines = completedLines(card);
  const nearMiss = new Map(nearMissLines(card).map((n) => [n.missingCell, colors.stampGold]));

  function handlePress(cell: number) {
    const tile = tileAt(card!, cell);
    if (!tile) {
      navigation.navigate('TileSheet', { cell });
      return;
    }
    const out = pressTile(cell);
    if (out.crossed) {
      setStampKeys((s) => ({ ...s, [cell]: (s[cell] ?? 0) + 1 }));
      stampHit();
      sound.play('stamp');
    } else {
      lightTap();
    }
    if (out.newBingoLines.length || out.cardCompleted) {
      confettiAccent.current = colors.stampGold;
      setConfetti((c) => c + 1);
      if (out.cardCompleted) {
        triumphHit();
        sound.play('trophy');
      } else {
        bingoHit();
        sound.play('chord');
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.kicker}>ON MY CARD</Text>
        <Text style={type.display}>{card.title}</Text>

        {nudge && (
          <View style={styles.coach}>
            <Text style={styles.coachKicker}>COACH</Text>
            <Text style={styles.coachText}>{nudge.content}</Text>
          </View>
        )}

        {showSyncBanner && (
          <Pressable style={styles.banner} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.bannerText}>☁️ Back up this card — sign in</Text>
            <Text style={styles.bannerArrow}>→</Text>
          </Pressable>
        )}

        <View style={styles.statRow}>
          <Pill text={`${summary.bingos} bingo${summary.bingos === 1 ? '' : 's'}`} tone="ink" />
          <Pill text={`${summary.crossed}/${summary.total} crossed`} tone="neutral" />
          {nextRw && <Pill text={`Next: ${nextRw.bingos} → ${truncate(nextRw.text || 'reward', 22)}`} tone="gold" />}
        </View>

        <View style={[styles.gridWrap, { width: gridW, height: gridW }]}>
          {bingoLines.map((line) => (
            <BingoRail key={line} line={line} accent={colors.stampGold} layout={layout} />
          ))}
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
            return (
              <View key={cell} style={stylePos}>
                <CardTile
                  size={layout.cell}
                  label={tile?.label ?? '＋'}
                  emoji={tile?.emoji}
                  crossed={crossed}
                  oneAwayColor={!crossed ? nearMiss.get(cell) : undefined}
                  stampKey={stampKeys[cell] ?? 0}
                  onPress={() => handlePress(cell)}
                  onLongPress={() => tile && navigation.navigate('TileSheet', { cell })}
                />
              </View>
            );
          })}
        </View>

        <Text style={styles.hint}>Tap to cross off · long-press for detail · tap an empty cell to add</Text>
      </ScrollView>

      <Confetti trigger={confetti} intensity="burst" accent={confettiAccent.current} />
    </SafeAreaView>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, alignItems: 'center' },
  coach: {
    alignSelf: 'stretch',
    backgroundColor: colors.cardSunk,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  coachKicker: { ...type.kicker, fontSize: 10, marginBottom: 2 },
  coachText: { fontSize: 13, lineHeight: 18, color: colors.ink, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  bannerText: { fontSize: 13, fontWeight: '700', color: colors.goldInk },
  bannerArrow: { fontSize: 15, fontWeight: '800', color: colors.goldInk, paddingHorizontal: space.xs },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignSelf: 'stretch', marginTop: space.sm, marginBottom: space.lg },
  gridWrap: { position: 'relative', alignSelf: 'center', marginBottom: space.sm },
  hint: { ...type.tiny, textAlign: 'center', marginTop: space.xs, marginBottom: space.lg },
});
