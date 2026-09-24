import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInsight, type PeriodType } from '../ai/useInsight';
import { useAuth } from '../auth/AuthContext';
import { isCardComplete, prettyDate } from '../domain/logic';
import { disablePush, getPushPrefs, registerForPush, setCoachHour } from '../notifications/push';
import { getPermission, listScheduled } from '../notifications/scheduler';
import { useApp } from '../state/AppStateContext';
import { Card, GhostButton, Pill, PrimaryButton, Segmented } from '../ui/components';
import { colors, space, type } from '../ui/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = [7, 9, 12, 18, 20];
const COACH_HOURS = [9, 12, 15, 18, 20];
const MIN_PASSWORD_LEN = 6; // matches Supabase's default minimum

function describeSync(status: { lastSyncedAt: number | null; lastError: string | null }): string {
  if (status.lastError) return `Sync error — will retry (${status.lastError})`;
  if (!status.lastSyncedAt) return 'Not synced yet';
  const mins = Math.round((Date.now() - status.lastSyncedAt) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins}m ago`;
  return `Synced ${Math.round(mins / 60)}h ago`;
}

export default function SettingsScreen({ navigation }: any) {
  const { state, updateSettings, renameCard, resetAll, syncStatus } = useApp();
  const { status: authStatus, session, signOut, setPassword } = useAuth();
  const s = state.settings;
  const [scheduled, setScheduled] = useState(0);
  const [title, setTitle] = useState(state.card?.title ?? '');
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const { insight: reflection, loading: reflectionLoading, refresh: refreshReflection } = useInsight('reflection', { periodType });

  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [coachEnabled, setCoachEnabled] = useState(false);
  const [coachHour, setCoachHourState] = useState(15);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachUnavailable, setCoachUnavailable] = useState(false);

  useEffect(() => {
    if (authStatus !== 'signedIn') return;
    let cancelled = false;
    void getPushPrefs().then((prefs) => {
      if (cancelled || !prefs) return;
      setCoachEnabled(prefs.enabled);
      setCoachHourState(prefs.coachHour);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const toggleCoach = async (on: boolean) => {
    setCoachBusy(true);
    setCoachUnavailable(false);
    if (on) {
      const ok = await registerForPush(coachHour);
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

  const changeCoachHour = async (h: number) => {
    setCoachHourState(h);
    if (coachEnabled) await setCoachHour(h);
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

  useEffect(() => {
    void listScheduled().then(setScheduled);
  }, [s.notificationsEnabled, s.weeklyCheckinDay, s.weeklyCheckinHour, state.card]);

  const toggleNotifs = async (on: boolean) => {
    if (on && !(await getPermission())) {
      await updateSettings({ notificationsEnabled: false });
      return;
    }
    await updateSettings({ notificationsEnabled: on });
  };

  const complete = state.card ? isCardComplete(state.card) : false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.display}>Settings</Text>

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

        {state.card && (
          <>
            <Text style={styles.section}>The card</Text>
            <Card style={{ gap: space.sm }}>
              <Text style={styles.rowLabel}>Card name</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={() => renameCard(title)}
                style={styles.input}
                placeholderTextColor={colors.inkFaint}
              />
              {complete && (
                <View style={{ marginTop: space.xs }}>
                  <Pill text="🏆 Every square crossed off" tone="success" />
                </View>
              )}
            </Card>
          </>
        )}

        <Text style={styles.section}>Feedback</Text>
        <Card style={{ gap: space.md }}>
          <Row label="Sound" hint="Stamp thunk, chimes, fanfares. Respects the silent switch.">
            <Switch value={s.soundEnabled} onValueChange={(v) => updateSettings({ soundEnabled: v })} />
          </Row>
          <Row label="Haptics" hint="A kick every time you cross a square off.">
            <Switch value={s.hapticsEnabled} onValueChange={(v) => updateSettings({ hapticsEnabled: v })} />
          </Row>
        </Card>

        <Text style={styles.section}>The knock on the door</Text>
        <Card style={{ gap: space.md }}>
          <Row label="Weekly check-in" hint="One nudge a week — how the card's coming along.">
            <Switch value={s.notificationsEnabled} onValueChange={toggleNotifs} />
          </Row>
          {s.notificationsEnabled && (
            <>
              <Text style={styles.rowLabel}>Day</Text>
              <View style={styles.chips}>
                {DAYS.map((d, i) => (
                  <Chip key={d} label={d} on={s.weeklyCheckinDay === i} onPress={() => updateSettings({ weeklyCheckinDay: i })} />
                ))}
              </View>
              <Text style={styles.rowLabel}>Time</Text>
              <View style={styles.chips}>
                {HOURS.map((h) => (
                  <Chip key={h} label={`${h}:00`} on={s.weeklyCheckinHour === h} onPress={() => updateSettings({ weeklyCheckinHour: h })} />
                ))}
              </View>
              <Text style={styles.debug}>{scheduled} notification(s) scheduled</Text>
            </>
          )}
        </Card>

        {authStatus === 'signedIn' && (
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
                <Text style={styles.reflectionText}>{reflection.content}</Text>
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
                  <Text style={styles.rowLabel}>Time</Text>
                  <View style={styles.chips}>
                    {COACH_HOURS.map((h) => (
                      <Chip key={h} label={`${h}:00`} on={coachHour === h} onPress={() => changeCoachHour(h)} />
                    ))}
                  </View>
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
          {state.log.slice(0, 25).map((e) => (
            <View key={e.id} style={styles.logRow}>
              <Text style={styles.logIcon}>{iconFor(e.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{e.text}</Text>
                <Text style={styles.hint}>{prettyDate(e.ts)}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Text style={styles.section}>Data</Text>
        <Card style={{ gap: space.sm }}>
          <GhostButton danger label="Start over with a new card" onPress={() => resetAll()} />
        </Card>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  section: { ...type.kicker, marginTop: space.xl, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...type.h2, fontSize: 15 },
  hint: { ...type.tiny, lineHeight: 15, marginTop: 2 },
  input: { backgroundColor: colors.cardSunk, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.inkSoft },
  debug: { ...type.tiny, color: colors.inkFaint },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  saved: { color: colors.success, fontSize: 13, fontWeight: '700', marginTop: space.xs },
  reflectionText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  logRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  logIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  footer: { ...type.tiny, marginTop: space.xl, lineHeight: 16, textAlign: 'center' },
});
