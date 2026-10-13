import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '../ui/theme';

/**
 * Motion rewards — built on the RN `Animated` API only (no Reanimated).
 *  - <Confetti trigger={n} accent /> : a particle burst that fires when `trigger` changes.
 *  - <CelebrationOverlay payload /> : the full-screen takeover, one per queued event.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BASE_PALETTE = [...colors.goals, colors.stampGold, colors.ink];

export function Confetti({
  trigger,
  intensity = 'burst',
  accent,
  palette: paletteOverride,
  originY = SCREEN_H * 0.34,
}: {
  trigger: number;
  intensity?: 'burst' | 'full';
  accent?: string;
  /** Overrides the accent-derived palette entirely, e.g. for the BLACKOUT takeover. */
  palette?: string[];
  originY?: number;
}) {
  const count = intensity === 'full' ? 48 : 22;
  const progress = useRef(new Animated.Value(0)).current;
  const palette = paletteOverride ?? (accent ? [accent, colors.stampGold, colors.ink, accent] : BASE_PALETTE);

  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        key: `${i}`,
        color: palette[i % palette.length],
        dx: (Math.random() - 0.5) * (intensity === 'full' ? SCREEN_W : SCREEN_W * 0.72),
        dy: (intensity === 'full' ? SCREEN_H * 0.72 : SCREEN_H * 0.46) * (0.5 + Math.random()),
        size: 6 + Math.random() * 9,
        rot: (Math.random() - 0.5) * 8,
        round: Math.random() > 0.55,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger, count, intensity]
  );

  useEffect(() => {
    if (!trigger) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: intensity === 'full' ? 2100 : 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [trigger, progress, intensity]);

  if (!trigger) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p) => (
        <Animated.View
          key={p.key}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W / 2, SCREEN_W / 2 + p.dx] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [originY, originY + p.dy] }) },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot * 360}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// --- the takeover ---------------------------------------------------

export type CelebrationPayload =
  | { kind: 'bingo'; lineLabel: string }
  | { kind: 'card'; cardName: string; tileCount: number; bingos: number }
  | { kind: 'reward'; bingos: number; text: string };

export function CelebrationOverlay({
  payload,
  onDismiss,
}: {
  payload: CelebrationPayload | null;
  onDismiss: () => void;
}) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!payload) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70 }).start();
  }, [payload, pop]);

  if (!payload) return null;

  const isBlackout = payload.kind === 'card';
  const accent = colors.stampGold;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={styles.backdrop}>
      <Confetti
        trigger={1}
        intensity="full"
        accent={accent}
        palette={isBlackout ? ['#FFFFFF', colors.stampGold, '#FFFFFF', colors.stampGold] : undefined}
      />
      <Animated.View style={[styles.card, isBlackout && styles.cardBlackout, { opacity: pop, transform: [{ scale }] }]}>
        {payload.kind === 'bingo' && <BingoBody label={payload.lineLabel} accent={accent} />}
        {payload.kind === 'card' && <CardCompleteBody payload={payload} accent={accent} />}
        {payload.kind === 'reward' && <RewardBody payload={payload} />}
        <Pressable style={[styles.cta, { backgroundColor: accent }]} onPress={onDismiss}>
          <Text style={styles.ctaText}>{payload.kind === 'card' ? 'Onward' : payload.kind === 'reward' ? 'See rewards' : 'Nice'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function BingoBody({ label, accent }: { label: string; accent: string }) {
  return (
    <>
      <Text style={[styles.kicker, { color: accent }]}>LINE COMPLETE</Text>
      <Text style={styles.bigStamp}>BINGO</Text>
      <Text style={styles.sub}>{label}: five in a row. That's a bingo on the card.</Text>
    </>
  );
}

function CardCompleteBody({
  payload,
  accent,
}: {
  payload: Extract<CelebrationPayload, { kind: 'card' }>;
  accent: string;
}) {
  return (
    <>
      <Text style={[styles.kicker, { color: accent }]}>CARD COMPLETE</Text>
      <Text style={[styles.bigStamp, styles.bigStampBlackout]}>BLACKOUT</Text>
      <Text style={[styles.title, styles.titleDark]}>{payload.cardName}</Text>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: accent }]}>{payload.tileCount}/{payload.tileCount}</Text>
          <Text style={[styles.statLabel, styles.statLabelDark]}>crossed off</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: accent }]}>{payload.bingos}</Text>
          <Text style={[styles.statLabel, styles.statLabelDark]}>bingos</Text>
        </View>
      </View>
      <Text style={[styles.sub, styles.subDark]}>Every square, blacked out. That's the whole year.</Text>
    </>
  );
}

function RewardBody({ payload }: { payload: Extract<CelebrationPayload, { kind: 'reward' }> }) {
  return (
    <>
      <Text style={[styles.kicker, { color: colors.goldInk }]}>REWARD UNLOCKED</Text>
      <View style={styles.ticket}>
        <Text style={styles.ticketNum}>{payload.bingos} BINGO{payload.bingos > 1 ? 'S' : ''}</Text>
        <Text style={styles.ticketText}>{payload.text || 'Your reward'}</Text>
        <Text style={styles.ticketFoot}>Earned it. Go claim it.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 24, 12, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    zIndex: 100,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: space.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
  },
  cardBlackout: { backgroundColor: colors.ink, borderColor: colors.stampGold, borderWidth: 2 },
  kicker: { ...type.kicker, marginBottom: space.sm },
  title: { ...type.h1, textAlign: 'center' },
  titleDark: { color: '#FFFFFF' },
  sub: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.sm, lineHeight: 20 },
  subDark: { color: colors.line },
  bigStamp: {
    fontFamily: type.display.fontFamily,
    fontSize: 52,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 2,
    transform: [{ rotate: '-4deg' }],
  },
  bigStampBlackout: { fontSize: 42, color: '#FFFFFF' },
  stats: { flexDirection: 'row', gap: space.xl, marginTop: space.lg },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', fontFamily: type.h1.fontFamily },
  statLabel: { ...type.tiny, marginTop: 2 },
  statLabelDark: { color: colors.line },
  ticket: {
    marginTop: space.md,
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.stampGold,
    borderStyle: 'dashed',
    padding: space.lg,
    alignItems: 'center',
  },
  ticketNum: { ...type.kicker, color: colors.goldInk },
  ticketText: { ...type.h1, textAlign: 'center', marginTop: space.xs },
  ticketFoot: { ...type.tiny, marginTop: space.sm },
  cta: {
    marginTop: space.xl,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
