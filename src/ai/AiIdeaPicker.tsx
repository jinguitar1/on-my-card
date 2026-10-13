import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useInsight } from './useInsight';
import { GhostButton } from '../ui/components';
import { colors, space } from '../ui/theme';

export interface TileIdea {
  emoji: string;
  label: string;
  note: string;
}

function parseIdeas(content: string | undefined): TileIdea[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.tiles)) return parsed.tiles;
  } catch {
    // ignore — the Edge Function already normalizes this, but stay defensive
  }
  return [];
}

/** The "Research an idea with AI" option for an empty/swap square — aware of every
 *  tile already on this specific card (threaded through as cardId server-side) so it
 *  never suggests a duplicate. Shares the exact `{tiles:[{emoji,label,note}]}` shape
 *  tilegen already uses, just for 3 ideas instead of a full 24-30-tile deck. Tapping an
 *  idea applies it immediately, same as a bank suggestion — no extra preview step.
 *
 *  Shared between TileSheetScreen's empty-cell fill and TileEditScreen's "Swap for a
 *  different idea" — fully self-contained (only `cardId`/`cell`/`onPick` in, nothing
 *  closed over from either caller), so it lives here rather than in either screen. */
export function AiIdeaPicker({ cardId, cell, onPick }: { cardId: string; cell: number; onPick: (idea: TileIdea) => void }) {
  const { insight, loading, refresh } = useInsight('tilesuggest', { cardId, cell, auto: false });
  const ideas = useMemo(() => parseIdeas(insight?.content), [insight]);

  if (ideas.length === 0) {
    // This can genuinely take up to a minute (the same web-search round trip tilegen's
    // card generation does) — the request itself doesn't depend on this screen staying
    // open (it's a plain network call, not tied to the component's lifetime), so closing
    // this sheet or switching tabs never cancels it. The copy says so explicitly rather
    // than leaving a bare spinner, which read as broken/stuck when the wait ran long.
    return loading ? (
      <View style={[styles.breakdownLoading, { marginTop: space.md }]}>
        <ActivityIndicator color={colors.ink} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lead}>Researching ideas…</Text>
          <Text style={styles.hint}>
            Can take up to a minute. Feel free to close this and keep using the app — come back and tap again
            when you're ready, it'll pick up right where it left off.
          </Text>
        </View>
      </View>
    ) : (
      <GhostButton label="🔍 Research an idea with AI" onPress={() => refresh(false)} style={{ marginTop: space.md }} />
    );
  }

  return (
    <View style={{ marginTop: space.md }}>
      <Text style={styles.breakdownKicker}>AI RESEARCHED</Text>
      <View style={{ gap: space.sm }}>
        {ideas.map((idea, i) => (
          <Pressable key={i} onPress={() => onPick(idea)} style={styles.suggestion}>
            <Text style={styles.suggestionEmoji}>{idea.emoji}</Text>
            <Text style={styles.suggestionLabel}>{idea.label}</Text>
          </Pressable>
        ))}
      </View>
      <GhostButton
        label={loading ? 'Researching…' : '↻ Try different ideas'}
        onPress={() => refresh(true)}
        disabled={loading}
        style={{ marginTop: space.sm }}
      />
      {loading && (
        <Text style={[styles.hint, { marginTop: space.xs }]}>
          Can take up to a minute — the ideas above stay pickable while new ones research.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 15, marginTop: 2, color: colors.inkQuietFaint },
  breakdownLoading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  breakdownKicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1.2, color: colors.inkQuietFaint, marginBottom: space.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.lineQuiet,
    padding: space.md,
  },
  suggestionEmoji: { fontSize: 24 },
  suggestionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.ink, flex: 1 },
});
