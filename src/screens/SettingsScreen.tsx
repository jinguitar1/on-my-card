import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isCardComplete, prettyDate } from '../domain/logic';
import { getPermission, listScheduled } from '../notifications/scheduler';
import { useApp } from '../state/AppStateContext';
import { Card, GhostButton, Pill } from '../ui/components';
import { colors, space, type } from '../ui/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = [7, 9, 12, 18, 20];

export default function SettingsScreen() {
  const { state, updateSettings, renameCard, resetAll } = useApp();
  const s = state.settings;
  const [scheduled, setScheduled] = useState(0);
  const [title, setTitle] = useState(state.card?.title ?? '');

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
          <Text style={styles.hint}>Everything lives on this device. Sync is a future milestone.</Text>
          <GhostButton danger label="Start over with a new card" onPress={() => resetAll()} style={{ marginTop: space.xs }} />
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
  logRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  logIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  footer: { ...type.tiny, marginTop: space.xl, lineHeight: 16, textAlign: 'center' },
});
