import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import type { CompanionMood, CompanionStage } from '../domain/companion';
import { colors } from './theme';

/** A simple custom-drawn creature, not illustrated character art — personality comes from
 *  animation, color, and growth, not fidelity. Grows and deepens in color with stage. */
const SIZES: Record<CompanionStage, number> = { 0: 64, 1: 72, 2: 82, 3: 94, 4: 108 };

// A muted sprout -> bloom ramp, not a rainbow — ties the growth metaphor to color without
// competing with the rest of the app's mostly neutral palette.
const BODY_COLORS: Record<CompanionStage, string> = {
  0: '#C9D6B8',
  1: '#A9C68E',
  2: '#7FAE68',
  3: '#5E9650',
  4: '#C97B5F',
};

// Mouth curves by mood (0 = worried, 6 = triumphant) — a quadratic from the left corner
// to the right corner, with the control point above the corners for a frown (corners
// droop relative to the middle) and below for a smile (middle dips below the corners),
// the same idiom the original single baseline smile already used, just parameterized.
// Mood 6 is a filled closed shape instead of a stroked curve — a wide, visibly *open*
// cheering mouth, not just a deeper version of the same smile.
function Mouth({ mood }: { mood: CompanionMood }) {
  switch (mood) {
    case 0: // worried — corners droop, middle pulled up
      return <Path d="M36 70 Q50 60 64 70" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" fill="none" />;
    case 1: // uncertain — nearly flat
      return <Path d="M38 66 Q50 68 62 66" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" fill="none" />;
    case 2: // hopeful — small smile
      return <Path d="M40 64 Q50 70 60 64" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" fill="none" />;
    case 3: // content — the original baseline smile
      return <Path d="M38 64 Q50 74 62 64" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" fill="none" />;
    case 4: // happy — bigger smile
      return <Path d="M34 62 Q50 78 66 62" stroke={colors.ink} strokeWidth={3.5} strokeLinecap="round" fill="none" />;
    case 5: // excited — big smile
      return <Path d="M32 60 Q50 82 68 60" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" fill="none" />;
    case 6: // triumphant — wide open cheering mouth, filled not stroked
      return <Path d="M32 58 Q50 86 68 58 Q50 74 32 58 Z" fill={colors.ink} />;
  }
}

// Eyebrows only appear at the low end (worried/concerned) and high end (raised, excited/
// surprised) of the mood range — absent in the middle, same as the original single-smile
// design had no eyebrows at all, so a mid mood still reads exactly as it used to.
function Eyebrows({ mood }: { mood: CompanionMood }) {
  if (mood === 0) {
    // Inner ends raised toward the center, outer ends lower — the classic "concerned"
    // angle (as opposed to angled the other way, which reads as angry).
    return (
      <>
        <Path d="M22 42 L38 37" stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" />
        <Path d="M78 42 L62 37" stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" />
      </>
    );
  }
  if (mood >= 5) {
    return (
      <>
        <Path d="M22 42 Q28 35 35 42" stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        <Path d="M65 42 Q72 35 78 42" stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </>
    );
  }
  return null;
}

export function Companion({
  stage,
  mood = 3,
  playKey = 0,
  size: sizeOverride,
}: {
  stage: CompanionStage;
  /** Defaults to the original neutral/content expression for any caller (e.g.
   *  CardReveal's "meet your companion" introduction) that isn't tracking real
   *  percent-crossed progress. */
  mood?: CompanionMood;
  playKey?: number;
  size?: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(1)).current;

  // Continuous idle "breathing" — the same pulse idiom CardDetailScreen's
  // CoachTriggerButton already uses, so this reads as one consistent animation language
  // rather than a new idiom just for this component.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // A bigger one-shot spring bounce when `playKey` changes (a stage-up) — the same spring
  // constants Stamp (src/ui/components.tsx) uses for a cross-off, for a consistent "this
  // landed" feel across the app rather than inventing a new spring curve.
  useEffect(() => {
    if (!playKey) return;
    bounce.setValue(1);
    Animated.sequence([
      Animated.spring(bounce, { toValue: 1.25, useNativeDriver: true, friction: 4.5, tension: 160 }),
      Animated.spring(bounce, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }),
    ]).start();
  }, [playKey, bounce]);

  const breathe = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  // A caller may need a smaller companion in a tight inline spot (e.g. CardReveal's "meet
  // your companion" row) — the stage-driven size is still the default everywhere else.
  const size = sizeOverride ?? SIZES[stage];
  const color = BODY_COLORS[stage];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ scale: Animated.multiply(breathe, bounce) }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Ellipse cx={50} cy={56} rx={42} ry={38} fill={color} />
          <Circle cx={26} cy={60} r={6} fill="#fff" opacity={0.3} />
          <Circle cx={74} cy={60} r={6} fill="#fff" opacity={0.3} />
          <Circle cx={36} cy={50} r={5} fill={colors.ink} />
          <Circle cx={64} cy={50} r={5} fill={colors.ink} />
          <Eyebrows mood={mood} />
          <Mouth mood={mood} />
        </Svg>
      </Animated.View>
      {/* A stage-up (body growth) earns a sparkle same as before; a near-perfect/perfect
          mood (real progress, independent of stage) earns one too, and the top mood
          stacks a second on the opposite corner for a bigger "triumphant" moment. */}
      {(stage >= 3 || mood >= 5) && <Text style={styles.sparkle}>✨</Text>}
      {mood === 6 && <Text style={[styles.sparkle, styles.sparkleLeft]}>✨</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  sparkle: { position: 'absolute', top: -2, right: -4, fontSize: 18 },
  sparkleLeft: { right: undefined, left: -4 },
});
