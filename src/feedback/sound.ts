import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { createContext, createElement, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';

/**
 * The reward sound bank (assets synthesized by scripts/gen-sounds.js).
 * Players are created once and reused; each play seeks to 0 first so rapid taps
 * retrigger cleanly. Respects the device silent switch (playsInSilentMode: false)
 * and the in-app Sound toggle. See DESIGN-FRAMEWORK.md §4.
 */

export type SoundName = 'stamp' | 'chord' | 'fanfare' | 'trophy';

const SOURCES: Record<SoundName, number> = {
  stamp: require('../../assets/sounds/stamp.wav'),
  chord: require('../../assets/sounds/chord.wav'),
  fanfare: require('../../assets/sounds/fanfare.wav'),
  trophy: require('../../assets/sounds/trophy.wav'),
};

let enabled = true;
export function setSoundEnabled(v: boolean) {
  enabled = v;
}

interface SoundApi {
  play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundApi>({ play: () => {} });

export function SoundProvider({ children }: { children: ReactNode }) {
  const playersRef = useRef<Partial<Record<SoundName, AudioPlayer>>>({});

  useEffect(() => {
    let cancelled = false;
    const players: Partial<Record<SoundName, AudioPlayer>> = {};

    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
      } catch {
        // non-fatal
      }
      if (cancelled) return;
      for (const name of Object.keys(SOURCES) as SoundName[]) {
        try {
          const p = createAudioPlayer(SOURCES[name]);
          p.volume = name === 'stamp' ? 0.7 : 0.8;
          players[name] = p;
        } catch {
          // a missing/undecodable asset shouldn't crash the app
        }
      }
      playersRef.current = players;
    })();

    return () => {
      cancelled = true;
      for (const p of Object.values(players)) {
        try {
          p?.remove();
        } catch {
          // already gone
        }
      }
      playersRef.current = {};
    };
  }, []);

  const api = useMemo<SoundApi>(
    () => ({
      play: (name) => {
        if (!enabled || Platform.OS === 'web') return;
        const p = playersRef.current[name];
        if (!p) return;
        try {
          void p.seekTo(0);
          p.play();
        } catch {
          // best-effort
        }
      },
    }),
    []
  );

  return createElement(SoundContext.Provider, { value: api }, children);
}

export function useSound(): SoundApi {
  return useContext(SoundContext);
}
