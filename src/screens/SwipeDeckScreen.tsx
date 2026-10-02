import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
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
 *
 * Resumable: `initialKept`/`initialRejected`/`initialUsedSecondPass` seed a paused
 * session back in (the caller is responsible for persisting them via `onProgress`,
 * fired whenever any of the three change — this component itself has no notion of
 * AppState/persistence, matching its existing pure/presentational design). The deck is
 * rebuilt excluding whatever's already been decided, so resuming never re-shows a tile
 * the user already swiped on.
 */
export default function SwipeDeckScreen({
  onDone,
  onProgress,
  initialKept = [],
  initialRejected = [],
  initialUsedSecondPass = false,
  customDeck,
}: {
  onDone: (kept: TileIdea[]) => void;
  onProgress?: (kept: TileIdea[], rejected: TileIdea[], usedSecondPass: boolean) => void;
  initialKept?: TileIdea[];
  initialRejected?: TileIdea[];
  initialUsedSecondPass?: boolean;
  /** An already-built deck to swipe through instead of the curated bank — e.g. an
   *  AI-researched set of ideas (see CreateCardScreen). Undefined (the default) keeps the
   *  original curated-bank behavior unchanged. */
  customDeck?: TileIdea[];
}) {
  const sound = useSound();
  const [deck, setDeck] = useState<TileIdea[]>(() => {
    const exclude = new Set([...initialKept, ...initialRejected].map((t) => t.id));
    return customDeck ? customDeck.filter((t) => !exclude.has(t.id)) : buildDeck(exclude);
  });
  const [rejected, setRejected] = useState<TileIdea[]>(initialRejected);
  const [kept, setKept] = useState<TileIdea[]>(initialKept);
  const [usedSecondPass, setUsedSecondPass] = useState(initialUsedSecondPass);
  const [writing, setWriting] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showKept, setShowKept] = useState(false);
  const cardRef = useRef<SwipeCardHandle>(null);

  useEffect(() => {
    onProgress?.(kept, rejected, usedSecondPass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept, rejected, usedSecondPass]);

  // A resumed session can land on an already-empty deck (everything was already
  // decided before the break) — buildDeck() with no excludes is never empty, so this
  // case doesn't exist outside resume; without this, the screen would just render
  // blank instead of finishing.
  useEffect(() => {
    if (deck.length === 0) onDone(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = deck[0];
  const upNext = deck[1];
  // AI-researched tiles always carry a real explanatory note (unfamiliar jargon, a
  // parade/dish name, etc.) — that's not optional flavor text the way a curated-bank
  // note sometimes is, so it defaults to visible instead of hidden behind the ⓘ tap.
  const aiSourced = !!customDeck;

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
      {/* A normal in-flow element (not position:absolute) specifically so it can never
          overlap the progress bar below it — the earlier absolute-positioned version sat
          at the same y-coordinate as the progress bar's own top edge and visibly covered
          part of the gold fill. Hidden while the panel itself is open — the panel already
          has its own clearer "Kept so far (N)" header + ✕, so leaving this visible on top
          of it was just duplicate clutter at the exact spot the panel's own close control
          lives. Left-aligned so it never sits right next to this screen's own top-right
          "Close" control (CreateCardScreen's header) either. */}
      {!showKept && (
        <Pressable style={styles.keptToggle} onPress={() => setShowKept(true)} hitSlop={8}>
          <Text style={styles.keptToggleText}>📋 Kept ({kept.length})</Text>
        </Pressable>
      )}

      <View style={styles.progressRow}>
        <ProgressBar pct={progressPct} color={colors.stampGold} height={6} />
        <Text style={styles.progressHint}>Swipe right to keep · left to skip · {kept.length}/{TARGET_KEEPS} kept</Text>
      </View>

      <View style={styles.stack}>
        {upNext && (
          <View style={[styles.peek, { width: CARD_W, height: CARD_H, backgroundColor: categoryWash(upNext.category, 0.18) }]} />
        )}
        <SwipeCard key={current.id} ref={cardRef} idea={current} onSwipeComplete={handleSwipe} noteShownByDefault={aiSourced} />
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
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
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

      {showKept && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowKept(false)} />
          <View style={styles.keptPanel}>
            <View style={styles.keptHeader}>
              <Text style={styles.keptTitle}>Kept so far ({kept.length})</Text>
              <Pressable onPress={() => setShowKept(false)} hitSlop={12}>
                <Text style={styles.keptClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.keptList} showsVerticalScrollIndicator={false}>
              {kept.length === 0 && <Text style={styles.keptEmpty}>Nothing kept yet.</Text>}
              {kept.map((t) => (
                <View key={t.id} style={styles.keptRow}>
                  <Text style={styles.keptEmoji}>{t.emoji}</Text>
                  <Text style={styles.keptLabel} numberOfLines={2}>
                    {t.label}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

// --- the card itself, with its own gesture lifecycle -----------------

interface SwipeCardHandle {
  swipe: (direction: 'left' | 'right') => void;
}

const SwipeCard = forwardRef<
  SwipeCardHandle,
  { idea: TileIdea; onSwipeComplete: (direction: 'left' | 'right') => void; noteShownByDefault?: boolean }
>(
  function SwipeCard({ idea, onSwipeComplete, noteShownByDefault }, ref) {
    const pan = useRef(new Animated.ValueXY()).current;
    const [noteShown, setNoteShown] = useState(!!noteShownByDefault);
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
  progressHint: { ...type.tiny, textAlign: 'center', marginTop: space.sm },
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
  keptToggle: {
    alignSelf: 'flex-start',
    marginLeft: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...shadow.lift,
  },
  keptToggleText: { ...type.label, color: colors.ink },
  keptPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: Math.min(SCREEN_W * 0.72, 300),
    backgroundColor: colors.paper,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
    ...shadow.lift,
  },
  keptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  keptTitle: { ...type.label, color: colors.ink },
  keptClose: { fontSize: 16, color: colors.inkFaint },
  keptList: { flex: 1 },
  keptEmpty: { ...type.body, color: colors.inkFaint },
  keptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  keptEmoji: { fontSize: 20 },
  keptLabel: { ...type.body, color: colors.ink, flex: 1 },
});
