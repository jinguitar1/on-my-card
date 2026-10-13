import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInsight, type PeriodType } from '../ai/useInsight';
import { useAuth } from '../auth/AuthContext';
import { FEATURES } from '../config/features';
import { prettyDate } from '../domain/logic';
import { ALL_COACH_DAYS, disablePush, getPushPrefs, registerForPush, setCoachDays, setCoachMinutes } from '../notifications/push';
import { getPermission } from '../notifications/scheduler';
import { useApp } from '../state/AppStateContext';
import { Card, GhostButton, PrimaryButton, Segmented } from '../ui/components';
import { colors, space, type } from '../ui/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = [7, 9, 12, 18, 20].map((h) => h * 60); // web fallback only — native uses the clock picker below
const COACH_HOURS = [7, 9, 12, 15, 18, 20, 21].map((h) => h * 60); // web fallback only
const ACTIVITY_PAGE_SIZE = 4;
const ACTIVITY_MAX = 25;

const MIN_PASSWORD_LEN = 6; // matches Supabase's default minimum

function formatTime(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeSync(status: { lastSyncedAt: number | null; lastError: string | null }): string {
  if (status.lastError) return `Sync error — will retry (${status.lastError})`;
  if (!status.lastSyncedAt) return 'Not synced yet';
  const mins = Math.round((Date.now() - status.lastSyncedAt) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins}m ago`;
  return `Synced ${Math.round(mins / 60)}h ago`;
}

interface SettingsDraft {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  weeklyCheckinDays: number[];
  weeklyCheckinMinutes: number[];
}

export default function SettingsScreen({ navigation }: any) {
  const { state, updateSettings, resetAll, syncStatus, setTileDone, setFocusedTile } = useApp();
  const { status: authStatus, session, signOut, setPassword } = useAuth();
  const s = state.settings;

  // Edits here are drafts, not live-applied — nothing (sound/haptics, weekly check-in)
  // actually commits until "Save changes" is pressed, so a stray tap never silently
  // becomes the real setting. `committed` mirrors the actual app state; `dirty` is a
  // plain deep-ish compare between the two. (Card naming used to live here too — it now
  // lives only on CardDetailScreen, since a card name only makes sense in the context of
  // one specific card, not account-wide settings.)
  const committed: SettingsDraft = {
    soundEnabled: s.soundEnabled,
    hapticsEnabled: s.hapticsEnabled,
    notificationsEnabled: s.notificationsEnabled,
    weeklyCheckinDays: s.weeklyCheckinDays,
    weeklyCheckinMinutes: s.weeklyCheckinMinutes,
  };
  const [draft, setDraft] = useState<SettingsDraft>(committed);
  const dirty = JSON.stringify(draft) !== JSON.stringify(committed);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Pick up external changes (hydrate, sync reconcile) as long as there's nothing
  // unsaved sitting in the draft — an in-progress edit should never get clobbered.
  useEffect(() => {
    if (!dirty) setDraft(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.soundEnabled, s.hapticsEnabled, s.notificationsEnabled, s.weeklyCheckinDays, s.weeklyCheckinMinutes]);

  const saveChanges = () => {
    void updateSettings({
      soundEnabled: draft.soundEnabled,
      hapticsEnabled: draft.hapticsEnabled,
      notificationsEnabled: draft.notificationsEnabled,
      weeklyCheckinDays: draft.weeklyCheckinDays,
      weeklyCheckinMinutes: draft.weeklyCheckinMinutes,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const { insight: reflection, loading: reflectionLoading, refresh: refreshReflection } = useInsight('reflection', {
    periodType,
    auto: FEATURES.aiCoach,
  });

  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [coachEnabled, setCoachEnabled] = useState(false);
  const [coachMinutes, setCoachMinutesState] = useState<number[]>([]);
  const [coachDays, setCoachDaysState] = useState<number[]>(ALL_COACH_DAYS);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachUnavailable, setCoachUnavailable] = useState(false);

  const [activityVisible, setActivityVisible] = useState(ACTIVITY_PAGE_SIZE);

  useEffect(() => {
    if (authStatus !== 'signedIn') return;
    let cancelled = false;
    void getPushPrefs().then((prefs) => {
      if (cancelled || !prefs) return;
      setCoachEnabled(prefs.enabled);
      setCoachMinutesState(prefs.coachMinutes);
      setCoachDaysState(prefs.coachDays);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const toggleCoach = async (on: boolean) => {
    setCoachBusy(true);
    setCoachUnavailable(false);
    if (on) {
      const ok = await registerForPush();
      if (ok) {
        setCoachEnabled(true);
      } else {
        setCoachUnavailable(true);
      }
    } else {
      await disablePush();
      setCoachEnabled(false);
    }
    setCoachBusy(false);
  };

  const changeCoachMinutes = async (minutes: number[]) => {
    setCoachMinutesState(minutes);
    if (coachEnabled) await setCoachMinutes(minutes);
  };

  const toggleCoachDay = async (day: number) => {
    if (coachDays.includes(day) && coachDays.length === 1) return; // keep at least one day picked
    const next = coachDays.includes(day) ? coachDays.filter((d) => d !== day) : [...coachDays, day].sort();
    setCoachDaysState(next);
    if (coachEnabled) await setCoachDays(next);
  };

  const changeWeeklyCheckinMinutes = (minutes: number[]) => {
    setDraft((d) => ({ ...d, weeklyCheckinMinutes: minutes }));
  };

  const toggleWeeklyDay = (day: number) => {
    setDraft((d) => {
      const days = d.weeklyCheckinDays;
      if (days.includes(day) && days.length === 1) return d; // keep at least one day picked
      const next = days.includes(day) ? days.filter((x) => x !== day) : [...days, day].sort();
      return { ...d, weeklyCheckinDays: next };
    });
  };

  function cancelPasswordEdit() {
    setEditingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  }

  async function saveNewPassword() {
    setPasswordError(null);
    if (newPassword.length < MIN_PASSWORD_LEN) {
      setPasswordError(`At least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Those don't match.");
      return;
    }
    setPasswordBusy(true);
    const { error } = await setPassword(newPassword);
    setPasswordBusy(false);
    if (error) {
      setPasswordError(error);
      return;
    }
    cancelPasswordEdit();
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 4000);
  }

  // The OS permission prompt still fires immediately on toggling on (it's a one-time
  // system dialog, not a "setting" to stage and undo) — only the resulting value is
  // staged into the draft, not applied to real notification scheduling until Save.
  const toggleNotifs = async (on: boolean) => {
    if (on && !(await getPermission())) {
      setDraft((d) => ({ ...d, notificationsEnabled: false }));
      return;
    }
    setDraft((d) => ({ ...d, notificationsEnabled: on }));
  };

  // Dev-only test-data shortcuts (below, gated on __DEV__) — for quickly populating
  // realistic card states while testing AI coaching / the radar chart / focus mode,
  // instead of hand-tapping a dozen tiles every time. Operate on the first card as a
  // fixed, simple target — there's no "current card" concept in global state (which
  // card is open is purely a navigation-time param), so these just need *a* card, not
  // necessarily whichever one the user happens to be looking at.
  const devCard = state.cards[0];
  const randomizeProgress = () => {
    if (!devCard) return;
    const open = devCard.tiles.filter((t) => !t.doneAt);
    const count = Math.min(open.length, 3 + Math.floor(Math.random() * 12));
    const shuffled = [...open].sort(() => Math.random() - 0.5);
    shuffled.slice(0, count).forEach((t) => setTileDone(devCard.id, t.cell, true));
  };
  const focusRandomOpenTile = () => {
    if (!devCard) return;
    const open = devCard.tiles.filter((t) => !t.doneAt);
    if (open.length === 0) return;
    setFocusedTile(devCard.id, open[Math.floor(Math.random() * open.length)].id);
  };
  const uncrossEverything = () => {
    if (!devCard) return;
    devCard.tiles.filter((t) => t.doneAt).forEach((t) => setTileDone(devCard.id, t.cell, false));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <Text style={[type.quietDisplay, { fontSize: 30 }]}>Settings</Text>

        <Text style={[styles.section, { marginTop: space.md }]}>Account</Text>
        <Card style={{ gap: space.sm }}>
          {authStatus === 'signedIn' && session?.user?.email ? (
            <>
              <Text style={styles.rowLabel}>{session.user.email}</Text>
              <Text style={styles.hint}>{describeSync(syncStatus)}</Text>

              {editingPassword ? (
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    placeholderTextColor={colors.inkFaint}
                    secureTextEntry
                    textContentType="newPassword"
                    style={styles.input}
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.inkFaint}
                    secureTextEntry
                    textContentType="newPassword"
                    style={styles.input}
                  />
                  {passwordError && <Text style={styles.error}>{passwordError}</Text>}
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <GhostButton label="Cancel" onPress={cancelPasswordEdit} disabled={passwordBusy} style={{ flex: 1 }} />
                    <PrimaryButton label={passwordBusy ? 'Saving…' : 'Save'} onPress={saveNewPassword} disabled={passwordBusy} style={{ flex: 2 }} />
                  </View>
                </View>
              ) : (
                <>
                  {passwordSaved && <Text style={styles.saved}>Password saved.</Text>}
                  <GhostButton label="Set or change password" onPress={() => setEditingPassword(true)} style={{ marginTop: space.xs }} />
                </>
              )}

              <GhostButton label="Sign out" onPress={() => signOut()} />
            </>
          ) : (
            <>
              <Text style={styles.hint}>Not signed in — your card only lives on this device right now.</Text>
              <PrimaryButton
                label="Sign in to back up your card"
                onPress={() => navigation.navigate('SignIn')}
                style={{ marginTop: space.xs }}
              />
            </>
          )}
        </Card>

        <Text style={styles.section}>Feedback</Text>
        <Card style={{ gap: space.md }}>
          <Row label="Sound" hint="Stamp thunk, chimes, fanfares. Respects the silent switch.">
            <Switch value={draft.soundEnabled} onValueChange={(v) => setDraft((d) => ({ ...d, soundEnabled: v }))} />
          </Row>
          <Row label="Haptics" hint="A kick every time you cross a square off.">
            <Switch value={draft.hapticsEnabled} onValueChange={(v) => setDraft((d) => ({ ...d, hapticsEnabled: v }))} />
          </Row>
        </Card>

        <Text style={styles.section}>The knock on the door</Text>
        <Card style={{ gap: space.md }}>
          <Row label="Weekly check-in" hint="A nudge on the days and times you pick — how the card's coming along.">
            <Switch value={draft.notificationsEnabled} onValueChange={toggleNotifs} />
          </Row>
          {draft.notificationsEnabled && (
            <>
              <Text style={styles.rowLabel}>Days</Text>
              <View style={styles.chips}>
                {DAYS.map((d, i) => (
                  <Chip key={d} label={d} on={draft.weeklyCheckinDays.includes(i)} onPress={() => toggleWeeklyDay(i)} />
                ))}
              </View>
              <Text style={styles.rowLabel}>Times</Text>
              <TimeSlots minutes={draft.weeklyCheckinMinutes} webOptions={HOURS} onChange={changeWeeklyCheckinMinutes} />
            </>
          )}
        </Card>

        <View style={{ marginTop: space.md }}>
          {settingsSaved && <Text style={styles.saved}>Settings saved.</Text>}
          {dirty && !settingsSaved && <Text style={styles.hint}>You have unsaved changes.</Text>}
          <PrimaryButton label="Save changes" onPress={saveChanges} disabled={!dirty} style={{ marginTop: space.xs }} />
        </View>

        {FEATURES.aiCoach && authStatus === 'signedIn' && (
          <>
            <Text style={styles.section}>Reflection</Text>
            <Card style={{ gap: space.sm }}>
              <Segmented
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
                value={periodType}
                onChange={setPeriodType}
              />
              {reflection ? (
                <>
                  <Text style={styles.reflectionText}>{reflection.content}</Text>
                  <Text style={styles.hint}>Generated {formatTimestamp(reflection.created_at)}</Text>
                </>
              ) : (
                <Text style={styles.hint}>
                  {reflectionLoading ? 'Thinking…' : 'Cross off a few tiles, then check back here.'}
                </Text>
              )}
              <GhostButton label="Refresh" onPress={() => refreshReflection(true)} disabled={reflectionLoading} />
            </Card>

            <Text style={styles.section}>AI Coach</Text>
            <Card style={{ gap: space.sm }}>
              <Row label="Daily coaching nudge" hint="A push, timed to your day, pointing at what to do next.">
                <Switch value={coachEnabled} onValueChange={toggleCoach} disabled={coachBusy} />
              </Row>
              {coachEnabled && (
                <>
                  <Text style={styles.rowLabel}>Days</Text>
                  <View style={styles.chips}>
                    {DAYS.map((d, i) => (
                      <Chip key={d} label={d} on={coachDays.includes(i)} onPress={() => toggleCoachDay(i)} />
                    ))}
                  </View>
                  <Text style={styles.rowLabel}>Times</Text>
                  <TimeSlots minutes={coachMinutes} webOptions={COACH_HOURS} onChange={changeCoachMinutes} minuteInterval={5} />
                </>
              )}
              {coachUnavailable && (
                <Text style={styles.hint}>
                  Push needs a dev-client build, not Expo Go — see CLAUDE.md for the EAS setup steps.
                </Text>
              )}
            </Card>
          </>
        )}

        <Text style={styles.section}>Activity</Text>
        <Card style={{ gap: space.sm }}>
          {state.log.length === 0 && <Text style={styles.hint}>Nothing yet. Cross a square off.</Text>}
          {state.log.slice(0, activityVisible).map((e) => (
            <View key={e.id} style={styles.logRow}>
              <Text style={styles.logIcon}>{iconFor(e.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{e.text}</Text>
                <Text style={styles.hint}>{prettyDate(e.ts)}</Text>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {activityVisible < Math.min(state.log.length, ACTIVITY_MAX) && (
              <GhostButton
                label="Show more"
                onPress={() => setActivityVisible((v) => Math.min(v + ACTIVITY_PAGE_SIZE, ACTIVITY_MAX))}
                style={{ flex: 1 }}
              />
            )}
            {activityVisible > ACTIVITY_PAGE_SIZE && (
              <GhostButton
                label="Show less"
                onPress={() => setActivityVisible(ACTIVITY_PAGE_SIZE)}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </Card>

        {__DEV__ && (
          <>
            <Text style={styles.section}>Developer</Text>
            <Card style={{ gap: space.sm }}>
              <Text style={styles.hint}>
                Dev-only shortcuts for testing AI coaching, the radar chart, and focus mode without hand-tapping tiles.
              </Text>
              <GhostButton label="🎲 Randomize progress" onPress={randomizeProgress} disabled={!devCard} />
              <GhostButton label="🎯 Focus a random open tile" onPress={focusRandomOpenTile} disabled={!devCard} />
              <GhostButton danger label="Uncross everything" onPress={uncrossEverything} disabled={!devCard} />
              {/* Wiping everything used to be a user-facing "Data" section here — moved
                  dev-only now that "Create a new card" (the dashboard) is the normal,
                  non-destructive way to get a fresh card. */}
              <GhostButton danger label="⚠️ Reset all data" onPress={() => resetAll()} />
            </Card>
          </>
        )}

        <Text style={styles.footer}>On My Card — built on the five-part app model. See DESIGN-FRAMEWORK.md.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function iconFor(kind: string) {
  return kind === 'card' ? '🏆' : kind === 'bingo' ? '🟨' : kind === 'reward' ? '🎟️' : '✕';
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function dateToMinuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** A set of time-of-day slots (minutes since midnight) — each an independent, removable
 *  chip — plus a trailing "+ Add a time" affordance that opens the native clock/AM-PM
 *  picker. Shared by Weekly check-in and AI Coach, which both moved from a single
 *  required hour to "zero or more times, add explicitly." Web has no native
 *  time-picker support, so it falls back to a fixed multi-select chip list instead. */
function TimeSlots({
  minutes,
  webOptions,
  onChange,
  minuteInterval,
}: {
  minutes: number[];
  webOptions: number[];
  onChange: (next: number[]) => void;
  /** Restricts the picker to multiples of this many minutes — needed when the value is
   *  checked by a server poll (see AI Coach) rather than fired by the OS's own exact-time
   *  scheduler, so a chosen value always lines up with a poll tick. */
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
}) {
  const [showPicker, setShowPicker] = useState(false);
  // iOS's spinner fires onChange continuously as each wheel column settles mid-scroll —
  // committing straight from that would add whatever transient value happened to be
  // showing, not the one the user actually stopped on. So iOS buffers into this pending
  // value and only commits it when "Done" is tapped; Android's picker is a modal dialog
  // that only calls onChange once, on its own OK, so it commits immediately as before.
  const [pendingDate, setPendingDate] = useState(new Date());

  const addMinute = (m: number) => {
    if (minutes.includes(m)) return;
    onChange([...minutes, m].sort((a, b) => a - b));
  };
  const removeMinute = (m: number) => onChange(minutes.filter((x) => x !== m));

  if (Platform.OS === 'web') {
    return (
      <View style={styles.chips}>
        {webOptions.map((m) => (
          <Chip key={m} label={formatTime(m)} on={minutes.includes(m)} onPress={() => (minutes.includes(m) ? removeMinute(m) : addMinute(m))} />
        ))}
      </View>
    );
  }

  const openPicker = () => {
    setPendingDate(new Date());
    setShowPicker(true);
  };

  const onPicked = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed' || !date) return;
      addMinute(dateToMinuteOfDay(date));
      return;
    }
    if (date) setPendingDate(date);
  };

  const confirmPick = () => {
    addMinute(dateToMinuteOfDay(pendingDate));
    setShowPicker(false);
  };

  return (
    <>
      <View style={styles.chips}>
        {minutes.map((m) => (
          <Pressable key={m} onPress={() => removeMinute(m)} style={[styles.chip, styles.chipOn]}>
            <Text style={[styles.chipText, { color: '#fff' }]}>{formatTime(m)} ✕</Text>
          </Pressable>
        ))}
        <Pressable onPress={openPicker} style={styles.addChip}>
          <Text style={styles.addChipText}>+ Add a time</Text>
        </Pressable>
      </View>
      {showPicker && (
        <DateTimePicker
          value={pendingDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minuteInterval={minuteInterval}
          onChange={onPicked}
        />
      )}
      {Platform.OS === 'ios' && showPicker && <GhostButton label="Done" onPress={confirmPick} style={{ marginTop: space.xs }} />}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  section: { ...type.quietLabel, marginTop: space.xl, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.ink },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 15, marginTop: 2, color: colors.inkFaint },
  input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.lineQuiet, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, fontFamily: 'Manrope_700Bold', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.inkSoft },
  addChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  addChipText: { fontSize: 12, fontWeight: '800', color: colors.inkSoft },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  saved: { color: colors.success, fontSize: 13, fontWeight: '700', marginTop: space.xs },
  reflectionText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  logRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  logIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  footer: { ...type.tiny, marginTop: space.xl, lineHeight: 16, textAlign: 'center' },
});
