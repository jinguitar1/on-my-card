import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { CATEGORY_ACCENTS, type TileCategory } from '../domain/types';
import type { CategoryStat } from '../domain/logic';
import { colors, space, type } from './theme';

const CATEGORY_LABELS: Record<TileCategory, string> = {
  comfort: 'Comfort',
  adventure: 'Adventure',
  creative: 'Creative',
  health: 'Health',
  career: 'Career',
  kindness: 'Kindness',
  fun: 'Fun',
  mindful: 'Mindful',
};

const RINGS = 4;
const SIZE = 290;
const LABEL_PAD = 44;

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** The Card tab's "quick glance" of goal-category stats — current (crossed tiles) as a
 *  solid shape overlaid on projected (every tile on the card, as if it were finished) as
 *  a lighter dashed shape, one axis per TileCategory. Hand-rolled with react-native-svg
 *  primitives rather than a charting library, matching how Celebration.tsx hand-rolls
 *  confetti instead of pulling in an animation library.
 *
 *  `focusedCategory` (the focused tile's category, if one is set) draws one extra hint:
 *  a hollow ring one step past that axis's current dot, showing the "level up" crossing
 *  the focused tile off would give that category — the focus feature's payoff, visible
 *  right on the chart instead of only in the coaching copy. */
export function RadarChart({ data, focusedCategory }: { data: CategoryStat[]; focusedCategory?: TileCategory }) {
  const n = data.length;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const maxRadius = SIZE / 2 - LABEL_PAD;
  const maxValue = Math.max(4, ...data.map((d) => d.projected));

  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const radiusFor = (v: number) => (Math.min(v, maxValue) / maxValue) * maxRadius;

  const pointsFor = (values: number[]) =>
    values.map((v, i) => { const p = polarToXY(cx, cy, radiusFor(v), angleFor(i)); return `${p.x},${p.y}`; }).join(' ');

  const currentPoints = pointsFor(data.map((d) => d.current));
  const projectedPoints = pointsFor(data.map((d) => d.projected));

  const focusedIndex = focusedCategory ? data.findIndex((d) => d.category === focusedCategory) : -1;
  const focusBoost =
    focusedIndex >= 0
      ? {
          from: polarToXY(cx, cy, radiusFor(data[focusedIndex].current), angleFor(focusedIndex)),
          to: polarToXY(cx, cy, radiusFor(Math.min(data[focusedIndex].current + 1, maxValue)), angleFor(focusedIndex)),
        }
      : null;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {Array.from({ length: RINGS }).map((_, ringIdx) => {
          const r = (maxRadius * (ringIdx + 1)) / RINGS;
          const ringPoints = data.map((_, i) => { const p = polarToXY(cx, cy, r, angleFor(i)); return `${p.x},${p.y}`; }).join(' ');
          return <Polygon key={ringIdx} points={ringPoints} fill="none" stroke={colors.line} strokeWidth={1} />;
        })}

        {data.map((_, i) => {
          const p = polarToXY(cx, cy, maxRadius, angleFor(i));
          return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={colors.line} strokeWidth={1} />;
        })}

        <Polygon
          points={projectedPoints}
          fill={colors.stampGold}
          fillOpacity={0.12}
          stroke={colors.stampGold}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />
        <Polygon points={currentPoints} fill={colors.ink} fillOpacity={0.16} stroke={colors.ink} strokeWidth={2} />

        {data.map((d, i) => {
          const p = polarToXY(cx, cy, radiusFor(d.current), angleFor(i));
          return <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={CATEGORY_ACCENTS[d.category]} />;
        })}

        {focusBoost && (
          <>
            <Line
              x1={focusBoost.from.x}
              y1={focusBoost.from.y}
              x2={focusBoost.to.x}
              y2={focusBoost.to.y}
              stroke={colors.success}
              strokeWidth={2}
              strokeDasharray="3,3"
            />
            <Circle cx={focusBoost.to.x} cy={focusBoost.to.y} r={6} fill="none" stroke={colors.success} strokeWidth={2} />
            <Circle cx={focusBoost.to.x} cy={focusBoost.to.y} r={2} fill={colors.success} />
          </>
        )}

        {data.map((d, i) => {
          const p = polarToXY(cx, cy, maxRadius + 20, angleFor(i));
          return (
            <SvgText
              key={i}
              x={p.x}
              y={p.y}
              fontSize={10}
              fontWeight="800"
              fill={CATEGORY_ACCENTS[d.category]}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {CATEGORY_LABELS[d.category].toUpperCase()}
            </SvgText>
          );
        })}
      </Svg>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.ink }]} />
          <Text style={styles.legendText}>Now</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchOutline]} />
          <Text style={styles.legendText}>Full card</Text>
        </View>
        {focusBoost && (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.legendSwatchFocus]} />
            <Text style={styles.legendText}>Focus</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, marginTop: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendSwatchOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.stampGold, borderStyle: 'dashed' },
  legendSwatchFocus: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.success, borderRadius: 5 },
  legendText: { ...type.tiny },
});
