import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TileIdea } from '../domain/tileBank';
import { CELL_COUNT, CENTER, GRID } from '../domain/types';
import { Confetti } from '../feedback/Celebration';
import { triumphHit } from '../feedback/haptics';
import { useApp } from '../state/AppStateContext';
import SwipeDeckScreen from './SwipeDeckScreen';
import { CardTile, PrimaryButton, cardLayout } from '../ui/components';
import { categoryColor, colors, space, type } from '../ui/theme';

type Phase = 'welcome' | 'deck' | 'reveal';

export default function OnboardingNavigator() {
  const { createCard } = useApp();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [kept, setKept] = useState<TileIdea[]>([]);

  if (phase === 'welcome') return <WelcomeScreen onStart={() => setPhase('deck')} />;

  if (phase === 'deck') {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeDeckScreen
          onDone={(result) => {
            setKept(result);
            createCard(result.map((t) => ({ label: t.label, emoji: t.emoji, note: t.note, category: t.category, bankId: t.id })));
            setPhase('reveal');
          }}
        />
      </SafeAreaView>
    );
  }

  return <RevealScreen kept={kept} />;
}

function RevealScreen({ kept }: { kept: TileIdea[] }) {
  const { updateSettings } = useApp();
  return <RevealBody kept={kept} onEnter={() => void updateSettings({ onboardingComplete: true })} />;
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

// --- reveal: the finished card stamps in -------------------------

function RevealBody({ kept, onEnter }: { kept: TileIdea[]; onEnter: () => void }) {
  const { width } = useWindowDimensions();
  const gridW = Math.min(width - space.lg * 2, 420);
  const layout = useMemo(() => cardLayout(gridW), [gridW]);

  useEffect(() => {
    triumphHit();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.revealWrap}>
        <Text style={styles.revealHeadline}>Your card is ready.</Text>
        <View style={[styles.gridWrap, { width: gridW, height: gridW }]}>
          {Array.from({ length: CELL_COUNT }).map((_, cell) => {
            const r = Math.floor(cell / GRID);
            const c = cell % GRID;
            const stylePos = { position: 'absolute' as const, left: layout.pos(c), top: layout.pos(r) };
            if (cell === CENTER) {
              return (
                <View key={cell} style={stylePos}>
                  <CardTile isCenter size={layout.cell} />
                </View>
              );
            }
            const idea = kept[cell < CENTER ? cell : cell - 1];
            return (
              <View key={cell} style={stylePos}>
                <CardTile size={layout.cell} label={idea?.label ?? '＋'} emoji={idea?.emoji} />
              </View>
            );
          })}
        </View>
        <Confetti trigger={1} intensity="full" accent={colors.stampGold} />
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="Enter my card" onPress={onEnter} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  welcomeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  burst: { width: 260, height: 260, marginBottom: space.xl },
  welcomeHeadline: { ...type.display, fontSize: 34, textAlign: 'center', lineHeight: 40 },
  welcomeSub: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.md, fontSize: 16 },
  footer: { padding: space.lg, flexDirection: 'row' },
  revealWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  revealHeadline: { ...type.display, textAlign: 'center', marginBottom: space.xl },
  gridWrap: { position: 'relative' },
});
