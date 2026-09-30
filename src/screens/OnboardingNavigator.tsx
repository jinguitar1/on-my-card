import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TileIdea } from '../domain/tileBank';
import { useApp } from '../state/AppStateContext';
import { CardReveal } from './CardReveal';
import SwipeDeckScreen from './SwipeDeckScreen';
import { PrimaryButton, RoundButton } from '../ui/components';
import { categoryColor, colors, space, type } from '../ui/theme';

type Phase = 'welcome' | 'intro' | 'deck' | 'reveal';

export default function OnboardingNavigator() {
  const { createCard, updateSettings } = useApp();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [kept, setKept] = useState<TileIdea[]>([]);

  if (phase === 'welcome') return <WelcomeScreen onStart={() => setPhase('intro')} />;

  if (phase === 'intro') return <IntroScreen onStart={() => setPhase('deck')} />;

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeDeckScreen
          onDone={(result) => {
            setKept(result);
            setPhase('reveal');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <CardReveal
      kept={kept}
      defaultTitle={`My ${new Date().getFullYear()} Card`}
      ctaLabel="Enter my card"
      onSave={(title, emoji) => {
        createCard(
          kept.map((t) => ({ label: t.label, emoji: t.emoji, note: t.note, category: t.category, bankId: t.id })),
          title,
          emoji
        );
        void updateSettings({ onboardingComplete: true });
      }}
    />
  );
}

// --- welcome: warm, minimal, geometric --------------------------------

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.welcomeWrap}>
        <ShapeBurst />
        <Text style={styles.welcomeHeadline}>This is the year you say yes.</Text>
        <Text style={styles.welcomeSub}>One card. Twenty-five reasons to try something new.</Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="Let's build it" onPress={onStart} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

// --- intro: what's about to happen, before the deck starts flashing ------

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.introWrap}>
        <Text style={styles.introKicker}>SETTING UP YOUR CARD</Text>
        <Text style={styles.introHeadline}>Now let's pick your 24 squares.</Text>
        <View style={styles.introDemoRow}>
          <View style={styles.introDemoCol}>
            <RoundButton icon="✕" tone="danger" onPress={() => {}} size={52} />
            <Text style={styles.introDemoLabel}>Skip</Text>
          </View>
          <View style={styles.introDemoCol}>
            <RoundButton icon="✓" tone="success" onPress={() => {}} size={52} />
            <Text style={styles.introDemoLabel}>Keep</Text>
          </View>
        </View>
        <Text style={styles.introSub}>
          You'll see ideas one at a time — mostly things a little outside your comfort zone. Swipe right (or tap ✓)
          to keep one on your card, left (or ✕) to skip it. Keep the 24 that feel right — you can edit any square
          later.
        </Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="Start swiping" onPress={onStart} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

function ShapeBurst() {
  const dots = [
    { size: 120, top: -20, left: -30, color: categoryColor('comfort'), opacity: 0.85 },
    { size: 90, top: 60, left: 150, color: categoryColor('adventure'), opacity: 0.85 },
    { size: 70, top: 170, left: -10, color: categoryColor('creative'), opacity: 0.9 },
    { size: 150, top: 40, left: 40, color: categoryColor('fun'), opacity: 0.35 },
    { size: 50, top: 190, left: 190, color: categoryColor('mindful'), opacity: 0.9 },
  ];
  return (
    <View style={styles.burst} pointerEvents="none">
      {dots.map((d, i) => (
        <View key={i} style={{ position: 'absolute', width: d.size, height: d.size, borderRadius: d.size / 2, top: d.top, left: d.left, backgroundColor: d.color, opacity: d.opacity }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  welcomeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  introWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  introKicker: { ...type.kicker, marginBottom: space.md },
  introHeadline: { ...type.display, fontSize: 28, textAlign: 'center', lineHeight: 34, marginBottom: space.xl },
  introDemoRow: { flexDirection: 'row', gap: space.xxl, marginBottom: space.xl },
  introDemoCol: { alignItems: 'center', gap: space.xs },
  introDemoLabel: { ...type.label },
  introSub: { ...type.body, color: colors.inkSoft, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  burst: { width: 260, height: 260, marginBottom: space.xl },
  welcomeHeadline: { ...type.display, fontSize: 34, textAlign: 'center', lineHeight: 40 },
  welcomeSub: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.md, fontSize: 16 },
  footer: { padding: space.lg, flexDirection: 'row' },
});
