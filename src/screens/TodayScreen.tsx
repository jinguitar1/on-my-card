import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { companionLine, companionState } from '../domain/companion';
import { useApp } from '../state/AppStateContext';
import { Companion } from '../ui/Companion';
import { ProgressBar } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/** The landing screen for an opened card (CardDashboard -> Today -> CardDetail) — purely
 *  a status/motivation moment: the companion, the stage, a line about real progress, and
 *  one way forward. Deliberately *not* where the focus tile lives — that used to be
 *  shown here too (emoji/label headline, a line, an "I did this" button), but mixing
 *  "here's your card's overall status" with "here's one specific tile and an action for
 *  it" on the same screen read as two unrelated things competing for attention, not one
 *  clear page. The focus tile (and its "I did this" action) now only ever appears once
 *  you actually open the card (CardDetailScreen's own focus banner) — this screen's only
 *  job is to make someone want to tap through and keep going. */
export default function TodayScreen({ route, navigation }: any) {
  const cardId: string = route.params?.cardId;
  const { state } = useApp();
  const card = state.cards.find((c) => c.id === cardId);

  const companion = card ? companionState(card) : null;
  const prevStageRef = useRef(companion?.stage ?? 0);
  const [bounceKey, setBounceKey] = useState(0);

  useEffect(() => {
    if (!companion) return;
    if (companion.stage > prevStageRef.current) setBounceKey((k) => k + 1);
    prevStageRef.current = companion.stage;
  }, [companion?.stage]);

  if (!card || !companion) {
    navigation.goBack();
    return null;
  }

  const line = companionLine(card, companion);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Home</Text>
        </Pressable>

        <View style={styles.center}>
          <Text style={type.quietLabel}>TODAY</Text>

          <View style={styles.companionWrap}>
            <Companion stage={companion.stage} mood={companion.mood} playKey={bounceKey} />
          </View>
          {/* The companion's growth stage is a real status, not decoration — a color/size
              change alone isn't enough for someone to know what they're looking at, so it
              gets both a label (what stage) and a number (exactly how far through the card)
              rather than relying on the creature's shape alone. The face itself tracks this
              same number (`companion.mood`, see Companion.tsx) — worried at low completion,
              building toward visibly thrilled as it climbs toward 100. */}
          <View style={styles.stageRow}>
            <View style={styles.stageChip}>
              <Text style={styles.stageChipText}>{companion.label}</Text>
            </View>
            <Text style={styles.stagePct}>{Math.round(companion.pct)}%</Text>
          </View>

          <Text style={[type.quietQuote, styles.line]}>{line}</Text>

          <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('CardDetail', { cardId })}>
            <Text style={styles.primaryBtnText}>Open your card →</Text>
          </Pressable>
        </View>

        <View style={styles.bottom}>
          <ProgressBar pct={companion.pct} color={colors.accentClay} height={5} />
          <Text style={styles.bottomText}>
            {companion.crossed}/{companion.total} crossed · {companion.bingos} bingo{companion.bingos === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  content: { flex: 1, padding: space.lg, justifyContent: 'space-between' },
  backLink: { alignSelf: 'flex-start' },
  backLinkText: { ...type.quietBody, fontWeight: '700', color: colors.inkQuietFaint },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  companionWrap: { marginTop: space.lg, marginBottom: space.sm },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  stageChip: {
    backgroundColor: colors.accentClaySoft,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  stageChipText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.4, color: colors.accentClay },
  stagePct: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: colors.inkQuietFaint },
  line: { textAlign: 'center', maxWidth: 280 },
  primaryBtn: {
    // `alignSelf: 'stretch'` only centers a capped-width box when it actually fills the
    // parent's cross size — once `maxWidth` kicks in and caps it below that, "stretch"
    // degrades to left-anchored (there's no room left to stretch into, so it just sits
    // at the start), not centered. `alignSelf: 'center'` + explicit `width: '100%'` keeps
    // the same "fill, then cap at 300" sizing, but centers the resulting box instead.
    marginTop: space.xl,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 300,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { ...type.quietButton, color: colors.paperQuiet, fontSize: 15 },
  bottom: { gap: space.xs, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.lineQuiet },
  bottomText: { ...type.quietBody, fontSize: 12, color: colors.inkQuietFaint, textAlign: 'center' },
});
