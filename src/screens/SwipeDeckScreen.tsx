import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { uid } from '../domain/logic';
import { buildDeck, shuffle, type TileIdea } from '../domain/tileBank';
import { lightTap, stampHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { GhostButton, PrimaryButton, ProgressBar, RoundButton } from '../ui/components';
import { categoryColor, categoryWash, colors, radius, shadow, space, type } from '../ui/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const TARGET_KEEPS = 24;
const CARD_W = Math.min(SCREEN_W - space.xl * 2, 340);
const CARD_H = CARD_W * 1.25;

/**
 * The whole "fill your card" flow — no typing, just a stack of curated ideas you swipe
 * through. Swipe right (or tap ✓) to keep, left (or ✕) to skip. Stops the moment 24 are
 * kept; if the deck runs out first, gives the skipped pile one more shuffled pass, then
 * finishes with whatever's been kept — a few open squares is fine, they're fillable later.
 */
export default function SwipeDeckScreen({ onDone }: { onDone: (kept: TileIdea[]) => void }) {
  const sound = useSound();
  const [deck, setDeck] = useState<TileIdea[]>(() => buildDeck());
  const [rejected, setRejected] = useState<TileIdea[]>([]);
  const [kept, setKept] = useState<TileIdea[]>([]);
  const [usedSecondPass, setUsedSecondPass] = useState(false);
  const [writing, setWriting] = useState(false);
  const [customText, setCustomText] = useState('');
  const cardRef = useRef<SwipeCardHandle>(null);

  const current = deck[0];
  const upNext = deck[1];

  function addCustom() {
    const label = customText.trim();
    if (!label) return;
    const idea: TileIdea = { id: uid('custom'), emoji: '✍️', label, note: '' };
    const nextKept = [...kept, idea];
    setKept(nextKept);
    stampHit();
    sound.play('stamp');
    setCustomText('');
    setWriting(false);
    if (nextKept.length >= TARGET_KEEPS) onDone(nextKept);
  }

  function advance(nextKept: TileIdea[], nextRejected: TileIdea[], rest: TileIdea[]) {
    if (nextKept.length >= TARGET_KEEPS) {
      onDone(nextKept);
      return;
    }
    if (rest.length > 0) {
      setDeck(rest);
      return;
    }
    if (!usedSecondPass && nextRejected.length > 0) {
      setUsedSecondPass(true);
      setDeck(shuffle(nextRejected));
      setRejected([]);
      return;
    }
    onDone(nextKept);
  }

  function handleSwipe(direction: 'left' | 'right') {
    if (!current) return;
    const rest = deck.slice(1);
    if (direction === 'right') {
      stampHit();
      sound.play('stamp');
      const nextKept = [...kept, current];
      setKept(nextKept);
      advance(nextKept, rejected, rest);
    } else {
      lightTap();
      const nextRejected = [...rejected, current];
      setRejected(nextRejected);
      advance(kept, nextRejected, rest);
    }
  }

  const progressPct = Math.min(100, (kept.length / TARGET_KEEPS) * 100);

  if (!current) {
    return null; // advance() will have already called onDone
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.progressRow}>
        <ProgressBar pct={progressPct} color={colors.stampGold} height={6} />
      </View>

      <View style={styles.stack}>
        {upNext && (
          <View style={[styles.peek, { width: CARD_W, height: CARD_H, backgroundColor: categoryWash(upNext.category, 0.18) }]} />
        )}
        <SwipeCard key={current.id} ref={cardRef} idea={current} onSwipeComplete={handleSwipe} />
      </View>

      {writing ? (
        <View style={styles.writeBox}>
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            placeholder="Type your idea"
            placeholderTextColor={colors.inkFaint}
            style={styles.writeInput}
            autoFocus
          />
          <View style={styles.writeBtns}>
            <GhostButton label="Cancel" onPress={() => { setWriting(false); setCustomText(''); }} style={{ flex: 1 }} />
            <PrimaryButton label="Add to my card" onPress={addCustom} disabled={!customText.trim()} style={{ flex: 2 }} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.buttonRow}>
            <RoundButton icon="✕" tone="danger" onPress={() => cardRef.current?.swipe('left')} />
            <RoundButton icon="✓" tone="success" onPress={() => cardRef.current?.swipe('right')} />
          </View>
          <GhostButton label="✎ Write your own instead" onPress={() => setWriting(true)} />
        </>
      )}
    </View>
  );
}

// --- the card itself, with its own gesture lifecycle -----------------

interface SwipeCardHandle {
  swipe: (direction: 'left' | 'right') => void;
}

const SwipeCard = forwardRef<SwipeCardHandle, { idea: TileIdea; onSwipeComplete: (direction: 'left' | 'right') => void }>(
  function SwipeCard({ idea, onSwipeComplete }, ref) {
    const pan = useRef(new Animated.ValueXY()).current;
    const [noteShown, setNoteShown] = useState(false);
    const done = useRef(false);

    function forceSwipe(direction: 'left' | 'right') {
      if (done.current) return;
      done.current = true;
      const x = direction === 'right' ? SCREEN_W * 1.4 : -SCREEN_W * 1.4;
      Animated.timing(pan, { toValue: { x, y: 40 }, duration: 220, useNativeDriver: false }).start(() => onSwipeComplete(direction));
    }

    function resetPosition() {
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
    }

    useImperativeHandle(ref, () => ({ swipe: forceSwipe }));

    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_THRESHOLD) forceSwipe('right');
          else if (g.dx < -SWIPE_THRESHOLD) forceSwipe('left');
          else resetPosition();
        },
      })
    ).current;

    const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2], outputRange: ['-12deg', '0deg', '12deg'] });
    const keepOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
    const skipOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    const accent = categoryColor(idea.category);

    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          { width: CARD_W, height: CARD_H, backgroundColor: categoryWash(idea.category, 0.16), borderColor: accent },
          { transform: [...pan.getTranslateTransform(), { rotate }] },
        ]}
      >
        <Animated.View style={[styles.badge, styles.keepBadge, { opacity: keepOpacity }]}>
          <Text style={styles.badgeText}>KEEP</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.skipBadge, { opacity: skipOpacity }]}>
          <Text style={styles.badgeText}>SKIP</Text>
        </Animated.View>

        <Pressable style={styles.infoBtn} onPress={() => setNoteShown((v) => !v)}>
          <Text style={styles.infoBtnText}>ⓘ</Text>
        </Pressable>

        <Text style={styles.emoji}>{idea.emoji}</Text>
        <Text style={styles.label}>{idea.label}</Text>
        {noteShown && !!idea.note && <Text style={styles.note}>{idea.note}</Text>}
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.xl },
  progressRow: { width: CARD_W, alignSelf: 'center' },
  stack: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  peek: { position: 'absolute', borderRadius: radius.lg, transform: [{ scale: 0.94 }, { translateY: 10 }] },
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    ...shadow.lift,
  },
  badge: {
    position: 'absolute',
    top: space.xl,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  keepBadge: { left: space.lg, borderColor: colors.success, transform: [{ rotate: '-14deg' }] },
  skipBadge: { right: space.lg, borderColor: colors.danger, transform: [{ rotate: '14deg' }] },
  badgeText: { fontSize: 20, fontWeight: '900', letterSpacing: 1, color: colors.ink },
  infoBtn: { position: 'absolute', top: space.md, right: space.md, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  infoBtnText: { fontSize: 16, color: colors.inkFaint },
  emoji: { fontSize: 64, marginBottom: space.lg },
  label: { ...type.h1, textAlign: 'center' },
  note: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.md, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: space.xxl, alignItems: 'center' },
  writeBox: { width: CARD_W },
  writeInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  writeBtns: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
