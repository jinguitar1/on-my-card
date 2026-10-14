import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { useApp } from '../state/AppStateContext';
import { colors, goalColor, radius, space, type } from '../ui/theme';

const DEFAULT_CARD_EMOJI = '🃏';

/** The Card tab's landing screen — a list of every schedule the user has built, each
 *  opening its current `CardInstance` when tapped. Deliberately minimal on progress:
 *  each row shows only the title (plus a big personal emoji), nothing else (no focus
 *  tile / bingo count / crossed count) — those only appear once a specific card is
 *  actually opened (CardDetailScreen), so a glance at this list never leaks per-card
 *  progress. Rows lean bigger and warmer than a typical settings list, per "make the
 *  card pop more" — a large colored emoji circle (rotating through `goalColor`, the
 *  same per-card accent palette used elsewhere) and a bold serif title.
 *
 *  No in-progress-draft rows anymore — see `domain/types.ts`'s module comment on why
 *  the paused-build-session concept (`DraftCard`) was removed entirely in schema v6.
 *  "+ Create a new card" always starts a fresh session. */
export default function CardDashboardScreen({ navigation }: any) {
  const { state } = useApp();
  const { status: authStatus } = useAuth();
  const showSyncBanner = authStatus === 'signedOut';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.quietDisplay, { fontSize: 32 }]}>Home</Text>

        {showSyncBanner && (
          <Pressable style={styles.banner} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.bannerText}>☁️ Back up your cards: sign in</Text>
            <Text style={styles.bannerArrow}>→</Text>
          </Pressable>
        )}

        {state.schedules.length === 0 ? (
          <Text style={styles.hint}>No cards yet. Create one below.</Text>
        ) : (
          <View style={{ gap: space.md, marginTop: space.lg }}>
            {state.schedules.map((schedule, i) => (
              <Pressable
                key={schedule.id}
                style={styles.row}
                onPress={() => navigation.navigate('Today', { scheduleId: schedule.id })}
              >
                <View style={[styles.rowEmoji, { backgroundColor: goalColor(i) }]}>
                  <Text style={styles.rowEmojiText}>{DEFAULT_CARD_EMOJI}</Text>
                </View>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {schedule.title}
                </Text>
                <Text style={styles.rowArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable style={styles.addCard} onPress={() => navigation.navigate('CreateCard')}>
          <Text style={styles.addCardText}>＋ Create a new card</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  hint: { ...type.tiny, marginTop: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.accentClaySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  bannerText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.accentClay },
  bannerArrow: { fontSize: 15, fontWeight: '800', color: colors.accentClay, paddingHorizontal: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  rowEmoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowEmojiText: { fontSize: 19 },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.ink, flex: 1 },
  rowArrow: { fontSize: 16, fontWeight: '800', color: colors.inkQuietFaint },
  addCard: {
    marginTop: space.lg,
    borderWidth: 1.5,
    borderColor: colors.lineQuiet,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  addCardText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint },
});
