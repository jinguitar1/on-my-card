import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_BINGOS, bingoCount, rewardUnlocked, sortedRewards } from '../domain/logic';
import { randomIdentityLine } from '../domain/identityLines';
import { rewardHit } from '../feedback/haptics';
import { useSound } from '../feedback/sound';
import { useApp } from '../state/AppStateContext';
import { GhostButton, PrimaryButton, RewardTicket } from '../ui/components';
import { colors, space, type } from '../ui/theme';

const CLAIM_LINE_MS = 4000;

function IdentityLine({ text }: { text: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: CLAIM_LINE_MS - 220 - 400, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.identityLine, { opacity }]}>
      {text}
    </Animated.Text>
  );
}

export default function RewardsScreen() {
  const { state, addReward, editReward, removeReward, claimReward } = useApp();
  const sound = useSound();
  const card = state.card;

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftBingos, setDraftBingos] = useState('1');
  const [justClaimed, setJustClaimed] = useState<{ id: string; line: string } | null>(null);

  if (!card) return null;

  const rewards = sortedRewards(card);
  const bingos = bingoCount(card);

  const beginEdit = (id: string, text: string, b: number) => {
    setEditId(id);
    setDraft(text);
    setDraftBingos(String(b));
  };
  const commitEdit = () => {
    if (editId) editReward(editId, { text: draft.trim(), bingos: Math.max(1, Math.min(MAX_BINGOS, parseInt(draftBingos, 10) || 1)) });
    setEditId(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.kicker}>WHAT YOU'RE PLAYING FOR</Text>
          <Text style={type.display}>Rewards</Text>
          <Text style={[styles.count]}>
            {bingos}/{MAX_BINGOS} bingos so far
          </Text>

          <View style={{ gap: space.md, marginTop: space.lg }}>
            {rewards.map((r) => {
              const unlocked = rewardUnlocked(card, r);
              const st = r.claimedAt ? 'claimed' : unlocked ? 'unlocked' : 'locked';
              return (
                <View key={r.id}>
                  {editId === r.id ? (
                    <View style={styles.editBox}>
                      <View style={styles.editRow}>
                        <Text style={styles.editLabel}>At</Text>
                        <TextInput value={draftBingos} onChangeText={setDraftBingos} keyboardType="number-pad" style={styles.bingoInput} />
                        <Text style={styles.editLabel}>of {MAX_BINGOS} bingos:</Text>
                      </View>
                      <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="e.g. A nice dinner out"
                        placeholderTextColor={colors.inkFaint}
                        style={styles.textInput}
                        autoFocus
                      />
                      <View style={styles.editBtns}>
                        <GhostButton danger label="Delete" onPress={() => { removeReward(r.id); setEditId(null); }} style={{ flex: 1 }} />
                        <PrimaryButton label="Done" onPress={commitEdit} style={{ flex: 2 }} />
                      </View>
                    </View>
                  ) : (
                    <>
                      <RewardTicket
                        bingos={r.bingos}
                        text={r.text}
                        state={st}
                        onEdit={() => beginEdit(r.id, r.text, r.bingos)}
                        onClaim={() => {
                          claimReward(r.id);
                          rewardHit();
                          sound.play('fanfare');
                          const line = randomIdentityLine();
                          setJustClaimed({ id: r.id, line });
                          setTimeout(() => setJustClaimed((c) => (c?.id === r.id ? null : c)), CLAIM_LINE_MS);
                        }}
                      />
                      {justClaimed?.id === r.id && <IdentityLine key={justClaimed.line} text={justClaimed.line} />}
                    </>
                  )}
                </View>
              );
            })}
          </View>

          {rewards.length < MAX_BINGOS && (
            <Pressable style={styles.addRung} onPress={addReward}>
              <Text style={styles.addRungText}>＋ Add a rung</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  count: { fontSize: 16, fontWeight: '800', marginTop: space.md, color: colors.ink },
  identityLine: { ...type.body, fontStyle: 'italic', color: colors.goldInk, textAlign: 'center', marginTop: space.xs, paddingHorizontal: space.sm },
  editBox: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.stampGold, padding: space.md, gap: space.sm },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editLabel: { ...type.label },
  bingoInput: { width: 44, textAlign: 'center', backgroundColor: colors.cardSunk, borderRadius: 8, paddingVertical: 6, fontSize: 15, fontWeight: '800', color: colors.ink },
  textInput: { backgroundColor: colors.cardSunk, borderRadius: 8, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 14, color: colors.ink },
  editBtns: { flexDirection: 'row', gap: space.sm },
  addRung: {
    marginTop: space.lg,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addRungText: { ...type.label, color: colors.inkSoft },
});
