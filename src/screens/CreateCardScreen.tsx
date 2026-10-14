import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { prettyDate } from '../domain/logic';
import { deriveAnchor, resolvePeriod, validateCustomRange, type CardSchedule, type TimelineMode } from '../domain/schedule';
import { type TileIdea } from '../domain/tileBank';
import { useApp, type ScheduleDefinition } from '../state/AppStateContext';
import { CardReveal } from './CardReveal';
import CuratedBrowseScreen from './CuratedBrowseScreen';
import CustomDeckScreen from './CustomDeckScreen';
import { Card, GhostButton, PrimaryButton, Segmented } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Phase = 'timeline' | 'intent' | 'deck' | 'reveal';
type FillMethod = 'bank' | 'custom';

const MODE_OPTIONS: { value: TimelineMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom' },
];

const WEEKDAY_OPTIONS: { value: string; label: string }[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => ({
  value: String(i),
  label,
}));

const CUSTOM_DURATIONS = [
  { label: '1 week', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

/** Building an additional card from the dashboard's "+ Create a new card" button — the
 *  same swipe-deck mechanic as first-run onboarding, minus the welcome/intro phases (the
 *  user already knows the gesture; SwipeDeckScreen's own persistent reminder is enough on
 *  a repeat visit), plus a new first step: choosing this card's timeline (Stage 1 of the
 *  timeline/goal rearchitecture — see DESIGN-FRAMEWORK.md / CLAUDE.md).
 *
 *  Deliberately not resumable across app restarts, unlike the old draft-card flow this
 *  replaced: goals are now a persistent library you build up over time (see
 *  `domain/types.ts`'s module comment), so picking goals + a timeline + generating is
 *  meant to be quick enough in one sitting not to need a paused, persisted session. Going
 *  back a phase (or leaving the screen entirely) simply discards this session's
 *  in-progress choices — nothing is written to app state until the final "Add to my
 *  cards" tap on the reveal screen.
 *
 *  AI-researched decks are on hold for v1 — see `SuggestionPicker`'s own note on the same
 *  decision — so the only two fill methods offered are the curated bank and typing your
 *  own, exactly as `SuggestionPicker` already offers elsewhere. */
export default function CreateCardScreen({ navigation }: any) {
  const { createGoal, createSchedule } = useApp();

  const [phase, setPhase] = useState<Phase>('timeline');
  const [fillMethod, setFillMethod] = useState<FillMethod>('bank');
  const [kept, setKept] = useState<TileIdea[]>([]);

  // --- timeline choice (Step 1) -----------------------------------------------------
  const [mode, setMode] = useState<TimelineMode>('monthly');
  const [repeat, setRepeat] = useState(true);
  const [weeklyStartDay, setWeeklyStartDay] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [rollingAnchor, setRollingAnchor] = useState(false);
  const [customEndDays, setCustomEndDays] = useState(30);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const changeMode = (next: TimelineMode) => {
    setMode(next);
    setRepeat(next !== 'custom'); // sensible default per mode — still a one-tap toggle below
  };

  const customStart = useMemo(() => Date.now(), [phase]);
  const customEnd = customEndDate ? customEndDate.getTime() : customStart + customEndDays * 86_400_000;

  const buildDefinition = (title: string): ScheduleDefinition => {
    if (mode === 'custom') {
      const anchor = deriveAnchor({ mode: 'custom', now: customStart, timezone });
      return { title, mode, repeat, timezone, customStart, customEnd, ...anchor };
    }
    const anchor = deriveAnchor({ mode, now: Date.now(), timezone, rollingAnchor, weeklyStartDay });
    return {
      title,
      mode,
      repeat,
      timezone,
      weeklyStartDay: mode === 'weekly' ? weeklyStartDay : undefined,
      rollingAnchor: mode === 'monthly' || mode === 'annual' ? rollingAnchor : undefined,
      ...anchor,
    };
  };

  // Live preview of the resolved first period, so the choice above feels concrete
  // instead of abstract — built from a throwaway CardSchedule-shaped object, never
  // persisted.
  const preview = useMemo(() => {
    try {
      if (mode === 'custom' && !validateCustomRange(customStart, customEnd)) return null;
      const def = buildDefinition('');
      const pending: CardSchedule = { ...def, id: 'preview', createdAt: Date.now(), lifecycleState: 'active' };
      return resolvePeriod(pending, Date.now());
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, repeat, weeklyStartDay, rollingAnchor, customEndDays, customEndDate]);

  const close = () => navigation.goBack();

  if (phase === 'timeline') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={12}>
            <Text style={styles.closeText}>← Back</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[type.quietCardTitle, { fontSize: 24 }]}>Set a timeline for this card</Text>
          <Text style={styles.hint}>Pick how long you'll have. You can change the details below, or keep the defaults.</Text>

          <Segmented options={MODE_OPTIONS} value={mode} onChange={changeMode} />

          {mode !== 'custom' && (
            <Card style={{ marginTop: space.md, gap: space.sm }}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Start a new timeline automatically</Text>
                <Switch value={repeat} onValueChange={setRepeat} />
              </View>

              {mode === 'weekly' && (
                <View>
                  <Text style={styles.rowLabel}>Week starts on</Text>
                  <Segmented
                    options={WEEKDAY_OPTIONS}
                    value={String(weeklyStartDay)}
                    onChange={(v) => setWeeklyStartDay(Number(v) as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
                  />
                </View>
              )}

              {(mode === 'monthly' || mode === 'annual') && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>
                    {rollingAnchor ? `Keeps today's ${mode === 'monthly' ? 'day of month' : 'date'}` : `Always starts ${mode === 'monthly' ? 'on the 1st' : 'Jan 1'}`}
                  </Text>
                  <Switch value={rollingAnchor} onValueChange={setRollingAnchor} />
                </View>
              )}
            </Card>
          )}

          {mode === 'custom' && (
            <Card style={{ marginTop: space.md, gap: space.sm }}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Start a new timeline automatically</Text>
                <Switch value={repeat} onValueChange={setRepeat} />
              </View>
              <Text style={styles.rowLabel}>Deadline</Text>
              {Platform.OS === 'web' ? (
                <View style={styles.chips}>
                  {CUSTOM_DURATIONS.map((d) => (
                    <Pressable
                      key={d.days}
                      onPress={() => {
                        setCustomEndDate(null);
                        setCustomEndDays(d.days);
                      }}
                      style={[styles.chip, customEndDate === null && customEndDays === d.days && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, customEndDate === null && customEndDays === d.days && styles.chipTextOn]}>{d.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <Pressable onPress={() => setShowCustomPicker(true)} style={styles.dateButton}>
                    <Text style={styles.dateButtonText}>{prettyDate(customEnd)}</Text>
                  </Pressable>
                  {showCustomPicker && (
                    <DateTimePicker
                      value={customEndDate ?? new Date(customEnd)}
                      mode="date"
                      minimumDate={new Date(customStart + 86_400_000)}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        if (Platform.OS === 'android') {
                          setShowCustomPicker(false);
                          // Android's dismiss action still calls onChange with the
                          // picker's original value, not undefined — only `event.type`
                          // tells a real pick apart from a cancel.
                          if (event.type !== 'dismissed' && date) setCustomEndDate(date);
                          return;
                        }
                        if (date) setCustomEndDate(date);
                      }}
                    />
                  )}
                  {Platform.OS === 'ios' && showCustomPicker && (
                    <GhostButton label="Done" onPress={() => setShowCustomPicker(false)} style={{ marginTop: space.xs }} />
                  )}
                </>
              )}
            </Card>
          )}

          {preview && (
            <Text style={styles.preview}>
              Deadline: {prettyDate(preview.end)}
              {repeat ? ' — a new timeline starts automatically after' : ' — a one-time deadline'}
            </Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Next" tone="clay" onPress={() => setPhase('intent')} style={{ flex: 1 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'intent') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => setPhase('timeline')} hitSlop={12}>
            <Text style={styles.closeText}>← Back</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          <Text style={[type.quietCardTitle, { fontSize: 24 }]}>How do you want to fill it?</Text>
          <Segmented
            options={[
              { value: 'bank', label: 'Curated Ideas' },
              { value: 'custom', label: 'Customized' },
            ]}
            value={fillMethod}
            onChange={setFillMethod}
          />
          {fillMethod === 'custom' ? (
            <Text style={styles.hint}>Type each tile in yourself. Add as many as you like, aim for 24.</Text>
          ) : (
            <Text style={styles.hint}>Browse pre-written ideas and add the ones you like. Aim for 24.</Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton
            label={fillMethod === 'custom' ? 'Start Typing' : 'Browse Ideas'}
            tone="clay"
            onPress={() => setPhase('deck')}
            style={{ flex: 1 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => setPhase('intent')} hitSlop={12}>
            <Text style={styles.closeText}>← Back</Text>
          </Pressable>
        </View>
        {fillMethod === 'custom' ? (
          <CustomDeckScreen
            initialKept={kept}
            onProgress={setKept}
            onDone={(result) => {
              setKept(result);
              setPhase('reveal');
            }}
          />
        ) : (
          <CuratedBrowseScreen
            initialKept={kept}
            onProgress={setKept}
            onDone={(result) => {
              setKept(result);
              setPhase('reveal');
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <CardReveal
      kept={kept}
      defaultTitle={`My ${MODE_OPTIONS.find((m) => m.value === mode)?.label ?? ''} Card`}
      ctaLabel="Add to my cards"
      onAddMore={() => setPhase('deck')}
      onSave={(title) => {
        const goals = kept.map((t) =>
          createGoal({ title: t.label, difficulty: 'medium', type: 'oneOff', emoji: t.emoji, note: t.note, category: t.category, bankId: t.id })
        );
        const result = createSchedule(buildDefinition(title), goals.map((g) => g.id));
        if (!result.ok) {
          // Explains the conflict rather than silently placing anyway, per the product
          // rules — this only fires with several "Hard" goals in the mix, since Easy/
          // Medium (every curated-bank idea, and every quick-typed custom one, since
          // neither currently prompts for difficulty) never conflicts.
          Alert.alert(
            'Too many hard goals on one line',
            `These lines can't fit them: ${result.conflictingLines.join(', ')}. Go back and swap one out, then try again.`
          );
          return;
        }
        navigation.goBack();
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  header: { flexDirection: 'row', paddingHorizontal: space.lg, paddingTop: space.md },
  closeText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkQuietFaint },
  body: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
  preview: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.accentClay, marginTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.accentClay, borderColor: colors.accentClay },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.inkSoft },
  chipTextOn: { color: '#fff' },
  dateButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  dateButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.ink },
});
