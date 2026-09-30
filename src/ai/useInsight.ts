import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabaseClient';

/**
 * Client for the `ai-insights` Edge Function (see supabase/functions/ai-insights).
 * Deliberately outside AppStateContext: this is supplementary/online-only, not
 * part of the local-first core state machine, so a failure here can never affect
 * the card/tiles/rewards the rest of the app depends on.
 *
 * Requires sign-in (the function reads the synced public.app_state row, which
 * only exists once a user has signed in at least once) — callers should check
 * `useAuth().status === 'signedIn'` before rendering anything from this hook.
 */

export type InsightKind = 'nudge' | 'reflection' | 'breakdown';
export type PeriodType = 'weekly' | 'monthly';

export interface Insight {
  id: string;
  kind: InsightKind;
  period: string;
  content: string;
  model: string;
  created_at: string;
}

export interface UseInsightOptions {
  periodType?: PeriodType;
  /** Required for kind: 'breakdown' — the tile this plan is for. */
  tileId?: string;
  /** Fetch automatically on mount (default true). Set false for anything heavier
   *  than the daily nudge/reflection — e.g. a tile breakdown, which should only
   *  generate when the user explicitly taps "Get a plan," not every time the tile
   *  sheet opens. */
  auto?: boolean;
}

interface UseInsightResult {
  insight: Insight | null;
  loading: boolean;
  /** Null on success or on the expected "no card yet" case — never shown as an error. */
  error: string | null;
  /** Pass `force: true` to bypass the cache and generate a fresh one (e.g. a
   *  "Regenerate" button) — otherwise this just checks whether a newer cached
   *  entry exists yet (a no-op within the same period for nudge/reflection, and
   *  always a no-op for breakdown, whose cache key never naturally advances).
   *  `context` (breakdown only) is free text the user typed about their own
   *  situation, folded into the prompt so the plan isn't generated from the tile
   *  label alone. */
  refresh: (force?: boolean, context?: string) => void;
  /** A pure content edit (e.g. hand-editing a breakdown's steps) that needs no new
   *  Claude call — writes straight to the existing `ai_insights` row instead of going
   *  through the Edge Function, relying on that table's "update own insights" RLS
   *  policy. Optimistically updates the local `insight` on success; resolves `false`
   *  (and leaves local state untouched) if there's nothing cached yet to update or the
   *  write fails. */
  updateContent: (content: string) => Promise<boolean>;
}

export function useInsight(kind: InsightKind, options: UseInsightOptions = {}): UseInsightResult {
  const { periodType, tileId, auto = true } = options;
  const { status } = useAuth();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchInsight = useCallback(
    (force = false, context?: string) => {
      if (status !== 'signedIn') {
        setInsight(null);
        return;
      }
      if (kind === 'breakdown' && !tileId) return;
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      void supabase.functions
        .invoke('ai-insights', { body: { kind, periodType, tileId, force, context } })
        .then(({ data, error: fnError }) => {
          if (id !== requestId.current) return; // a newer request superseded this one
          if (fnError) {
            setError(fnError.message);
            return;
          }
          if (data?.error) {
            // "no card yet" and similar expected misses — nothing to show, not a UI error.
            setInsight(null);
            return;
          }
          setInsight(data?.insight ?? null);
        })
        .catch((err) => {
          if (id !== requestId.current) return;
          setError(err instanceof Error ? err.message : 'Coach unavailable');
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    },
    [status, kind, periodType, tileId]
  );

  useEffect(() => {
    if (auto) fetchInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchInsight, auto]);

  const updateContent = useCallback(
    async (content: string): Promise<boolean> => {
      if (status !== 'signedIn' || !insight) return false;
      const { data, error: updErr } = await supabase
        .from('ai_insights')
        .update({ content })
        .eq('kind', kind)
        .eq('period', insight.period)
        .select()
        .single();
      if (updErr || !data) return false;
      setInsight(data as Insight);
      return true;
    },
    [status, kind, insight]
  );

  return { insight, loading, error, refresh: fetchInsight, updateContent };
}
