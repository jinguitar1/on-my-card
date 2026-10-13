import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GRID } from '../domain/types';
import { colors, radius, shadow, space, type } from './theme';

// --- buttons ----------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = 'ink',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'gold' | 'danger' | 'clay';
  style?: StyleProp<ViewStyle>;
}) {
  // 'clay' is the quiet redesign's one accent (src/ui/theme.ts's accentClay) — additive,
  // not a replacement for 'gold', so any screen not yet redesigned keeps rendering exactly
  // as it did.
  const bg = tone === 'gold' ? colors.stampGold : tone === 'danger' ? colors.danger : tone === 'clay' ? colors.accentClay : colors.ink;
  const fg = tone === 'gold' ? colors.goldInk : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 }, style]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.ghost, { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 }, style]}
    >
      <Text style={[styles.ghostText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** A round icon button — used for the swipe deck's ✕ / ✓ and similar tap-driven actions. */
export function RoundButton({
  icon,
  onPress,
  tone = 'neutral',
  size = 60,
}: {
  icon: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger' | 'success';
  size?: number;
}) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.card;
  const fg = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={{ fontSize: size * 0.4, color: fg }}>{icon}</Text>
    </Pressable>
  );
}

// --- containers -----------------------------------------------------

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({
  text,
  tone = 'neutral',
  color,
}: {
  text: string;
  tone?: 'neutral' | 'gold' | 'success' | 'ink';
  color?: string; // solid accent override
}) {
  const map = {
    neutral: [colors.cardSunk, colors.inkSoft],
    gold: [colors.goldSoft, colors.goldInk],
    success: [colors.successSoft, colors.success],
    ink: [colors.ink, '#fff'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: color ?? bg }]}>
      <Text style={[styles.pillText, { color: color ? '#fff' : fg }]}>{text}</Text>
    </View>
  );
}

export function ProgressBar({ pct, color = colors.ink, height = 8 }: { pct: number; color?: string; height?: number }) {
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.max(0, Math.min(100, pct)),
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, w]);
  return (
    <View style={[styles.track, { height }]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- the stamp ------------------------------------------------------

/** The rubber-stamp mark that lands on a crossed-off tile. */
export function Stamp({ playKey, mark = '✕', size = 30, color = colors.crossInk }: { playKey: number; mark?: string; size?: number; color?: string }) {
  const a = useRef(new Animated.Value(playKey ? 1 : 0)).current;

  useEffect(() => {
    if (!playKey) return;
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 4.5, tension: 160 }).start();
  }, [playKey, a]);

  return (
    <Animated.Text
      style={{
        fontSize: size,
        fontWeight: '900',
        color,
        opacity: a.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0.92] }),
        transform: [
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) },
          { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '-8deg'] }) },
        ],
      }}
    >
      {mark}
    </Animated.Text>
  );
}

// --- card grid geometry (fixed 5×5) --------------------------------

export const CARD_GAP = 6;

export function cardLayout(gridWidth: number) {
  const cell = (gridWidth - CARD_GAP * (GRID - 1)) / GRID;
  const pos = (i: number) => i * (cell + CARD_GAP);
  return { cell, pos, gridWidth };
}

// --- card tile ----------------------------------------------------

export interface CardTileProps {
  size: number;
  isCenter?: boolean;
  label?: string;
  emoji?: string;
  crossed?: boolean;
  oneAwayColor?: string;
  stampKey?: number;
  /** This is the card's one focused tile — draws a small gold ★ badge in the top-left
   *  corner (never the crossed-off stamp's corner, top-right, so the two can't clash).
   *  Kept visible even when the grid isn't dimmed (see CardDetailScreen), since it's the
   *  one persistent way to spot the focused tile once the tunnel-vision dimming itself
   *  has been dismissed. */
  isFocused?: boolean;
  /** Opt-in hairline border instead of the gold one, for the "quiet" redesign
   *  (CardDetailScreen only) — never the default, so CardReveal/onboarding's own
   *  CardTile usage is untouched. Only affects an uncrossed tile's border; the crossed
   *  "alive vs dead" treatment is unchanged regardless, since that's a settled decision. */
  quiet?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function CardTile({
  size,
  isCenter,
  label,
  emoji,
  crossed,
  oneAwayColor,
  stampKey = 0,
  isFocused,
  quiet,
  onPress,
  onLongPress,
}: CardTileProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!stampKey) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, friction: 4, tension: 150 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }),
    ]).start();
  }, [stampKey, scale]);

  useEffect(() => {
    if (!oneAwayColor) {
      glow.stopAnimation();
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [oneAwayColor, glow]);

  if (isCenter) {
    return (
      <View style={[styles.tile, styles.tileCenter, { width: size, height: size }]}>
        <Text style={styles.freeStar}>★</Text>
        <Text style={styles.freeText}>FREE</Text>
      </View>
    );
  }

  const baseBorderColor = quiet ? colors.lineQuiet : colors.stampGold;
  const baseBorderWidth = quiet ? 1 : 1.5;
  const borderColor = glow.interpolate({ inputRange: [0, 1], outputRange: [baseBorderColor, oneAwayColor ?? baseBorderColor] });
  const borderWidth = glow.interpolate({ inputRange: [0, 1], outputRange: [baseBorderWidth, 3] });
  const ribbonSize = Math.max(11, Math.round(size * 0.22));

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300} style={{ flex: 1 }}>
        <Animated.View style={[styles.tile, { borderColor, borderWidth }, crossed && styles.tileCrossed]}>
          {/* The empty-cell placeholder ('＋', the sentinel every caller passes for an
              unfilled square) gets its own bigger, dedicated style instead of sharing
              `tileLabel`'s tiny (8.5pt) size meant for wrapping a multi-word label — at
              that size a lone "+" read as barely-tappable. */}
          {label === '＋' ? (
            <Text style={styles.tilePlus}>{label}</Text>
          ) : (
            <>
              {!!emoji && <Text style={styles.tileEmoji}>{emoji}</Text>}
              {/* `adjustsFontSizeToFit` (not a fixed 8.5pt for every label) — a long single
                  word (e.g. "International") at a fixed tiny size could still be a hair too
                  wide for the tile, which React Native resolves by breaking the word itself
                  rather than reflowing, visibly orphaning its last letter onto the next line
                  with the following word. Shrinking the whole label to actually fit within
                  the 3 allotted lines avoids that word-break entirely. */}
              <Text
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.tileLabel, crossed && styles.tileLabelCrossed]}
              >
                {label}
              </Text>
            </>
          )}
          {crossed && (
            <View style={[styles.doneBadge, { width: ribbonSize, height: ribbonSize, borderRadius: ribbonSize / 2 }]}>
              <Stamp playKey={stampKey || 1} mark="✓" size={Math.max(10, Math.round(ribbonSize * 0.62))} color="#fff" />
            </View>
          )}
          {/* The gold star-in-circle badge used to also mark "part of a completed bingo
             line" (top-left) — retired, since every tile in a completed line is by
             definition crossed off, which directly conflicted with "crossed tiles
             shouldn't show the gold star." This corner is now exclusively the focus
             marker. */}
          {!crossed && isFocused && (
            <View style={[styles.focusBadge, { width: ribbonSize, height: ribbonSize, borderRadius: ribbonSize / 2 }]}>
              <Text style={{ fontSize: ribbonSize * 0.6, color: colors.crossInk, fontWeight: '900' }}>★</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// --- reward ticket ---------------------------------------------

export function RewardTicket({
  bingos,
  text,
  state,
  onClaim,
  onEdit,
}: {
  bingos: number;
  text: string;
  state: 'locked' | 'unlocked' | 'claimed';
  onClaim?: () => void;
  onEdit?: () => void;
}) {
  return (
    <View style={[styles.rewardTicket, state === 'claimed' && { opacity: 0.55 }]}>
      <View style={styles.rewardNotchL} />
      <View style={styles.rewardNotchR} />
      <View style={styles.rewardLeft}>
        <Text style={styles.rewardBig}>{bingos}</Text>
        <Text style={styles.rewardBingoLabel}>BINGO{bingos > 1 ? 'S' : ''}</Text>
      </View>
      <View style={styles.rewardBody}>
        <Pressable onPress={onEdit}>
          <Text style={styles.rewardText}>{text || 'Tap to name this reward'}</Text>
        </Pressable>
        {state === 'locked' && <Text style={styles.rewardState}>🔒 Locked</Text>}
        {state === 'unlocked' && (
          <Pressable style={styles.claimBtn} onPress={onClaim}>
            <Text style={styles.claimText}>Claim it</Text>
          </Pressable>
        )}
        {state === 'claimed' && <Text style={[styles.rewardState, { color: colors.success }]}>✓ Claimed</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: space.xl, alignItems: 'center' },
  btnText: { fontWeight: '800', fontSize: 15 },
  ghost: { paddingVertical: 10, alignItems: 'center' },
  ghostText: { color: colors.inkSoft, fontWeight: '700', fontSize: 14 },
  roundBtn: { alignItems: 'center', justifyContent: 'center', ...shadow.card },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    ...shadow.card,
  },

  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontSize: 12, fontWeight: '800' },

  track: { backgroundColor: colors.cardSunk, borderRadius: 999, overflow: 'hidden', width: '100%' },

  segment: { flexDirection: 'row', backgroundColor: colors.cardSunk, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: colors.card, ...shadow.card },
  segmentText: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  segmentTextActive: { color: colors.ink },

  // tile
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.stampGold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  // "Alive vs dead": an uncrossed tile stays fully colorful/vibrant (unchanged for now);
  // a crossed one is deliberately desaturated — grey, not gold — to read as drained of
  // color/life rather than just "a different accent." Went gold-branded for one round
  // and back — the gold wash read as still-vibrant/still-alive, working against the
  // "dead" read a completed tile is going for here. `cardSunk`/`lineStrong` are this
  // app's existing neutral "recessed" tokens, not a new color.
  tileCrossed: { backgroundColor: colors.cardSunk, borderColor: colors.lineStrong },
  tileCenter: { backgroundColor: colors.ink, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  freeStar: { color: colors.stampGold, fontSize: 20 },
  freeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 1 },
  tileEmoji: { fontSize: 15, marginBottom: 2 },
  tileLabel: { fontSize: 8.5, lineHeight: 10, textAlign: 'center', color: colors.ink, fontWeight: '700' },
  tilePlus: { fontSize: 22, color: colors.inkFaint, fontWeight: '300' },
  // Full opacity, not faded to near-invisible — a friend glancing at a shared card needs
  // to actually read what got done. Grey/muted (not the brand gold), matching the
  // desaturated "dead" background rather than the still-warm gold trio.
  tileLabelCrossed: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  // A small filled circle, not a bare mark floating on the tile — still the same
  // green-circle-checkmark language TileSheetScreen's plan-step checkboxes use... except
  // recolored to `colors.ink` (the FREE tile's own fill color) rather than green, to
  // keep this accent neutral rather than adding a third competing color to the grid.
  doneBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Top-right, same corner as doneBadge — never shown together, since crossing a tile
  // off always clears its focus.
  focusBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
    backgroundColor: colors.stampGold,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // reward ticket
  rewardTicket: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.stampGold,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  rewardNotchL: { position: 'absolute', left: -8, top: '50%', width: 16, height: 16, borderRadius: 8, marginTop: -8, backgroundColor: colors.paper },
  rewardNotchR: { position: 'absolute', right: -8, top: '50%', width: 16, height: 16, borderRadius: 8, marginTop: -8, backgroundColor: colors.paper },
  rewardLeft: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: colors.line,
    borderStyle: 'dashed',
    paddingVertical: space.md,
  },
  rewardBig: { fontFamily: type.h1.fontFamily, fontSize: 30, fontWeight: '800', color: colors.ink },
  rewardBingoLabel: { fontSize: 8, fontWeight: '900', color: colors.inkFaint, letterSpacing: 1 },
  rewardBody: { flex: 1, padding: space.md, gap: 6, justifyContent: 'center' },
  rewardText: { ...type.body, fontWeight: '700' },
  rewardState: { ...type.tiny },
  claimBtn: { alignSelf: 'flex-start', backgroundColor: colors.stampGold, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14 },
  claimText: { color: colors.goldInk, fontWeight: '900', fontSize: 12 },
});
