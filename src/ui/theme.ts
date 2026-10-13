/**
 * On My Card — "warm paper card" design tokens. Light-only
 * (app.config.js pins userInterfaceStyle: "light").
 */

import { Platform } from 'react-native';

import { CATEGORY_ACCENTS, GOAL_ACCENTS, type TileCategory } from '../domain/types';

export const colors = {
  paper: '#FBF6EA', // app ground — warm ivory
  card: '#FFFFFF', // tile / sheet surfaces
  cardSunk: '#F4EEDD', // recessed / empty cell

  // "Quiet" redesign tokens (Today screen, the Home dashboard, the Card grid) — additive,
  // not a replacement: every token above stays exactly as it was so Settings/Rewards/
  // SignIn/TileSheet/Onboarding keep rendering byte-identical. Only screens that
  // explicitly reach for `paperQuiet`/`accentClay`/etc. pick up the calmer palette.
  paperQuiet: '#FAFAF7', // a barely-there warm white, softer than `paper`
  lineQuiet: '#E9E6DD', // hairline grid/border color for the quiet screens
  inkQuietFaint: '#B5B2A8',
  accentClay: '#C97B5F', // the one accent color the quiet screens allow themselves
  accentClaySoft: '#F3E3DB', // a pale wash of accentClay, for the reskinned focus banner

  ink: '#1E1B16', // near-black, warm
  inkSoft: '#6B6357',
  inkFaint: '#A59C8C',

  line: '#E7DFC9', // hairline borders (warm)
  lineStrong: '#D8CDAE',

  stampGold: '#EFB007', // the signature — tile edges + the stamp
  goldSoft: '#FBE9BE',
  goldInk: '#6B4E00',

  crossInk: '#211C14', // the rubber-stamp mark

  success: '#2E8B84',
  successSoft: '#D8EEEC',
  danger: '#C63D2F',
  dangerSoft: '#F6E0DC',

  /** Per-card accents — index by GoalCard.colorIndex. */
  goals: GOAL_ACCENTS,
};

export function goalColor(colorIndex: number): string {
  return colors.goals[((colorIndex % colors.goals.length) + colors.goals.length) % colors.goals.length];
}

function wash(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Translucent version of a goal accent for rails / washes. */
export function goalWash(colorIndex: number, alpha = 0.14): string {
  return wash(goalColor(colorIndex), alpha);
}

export function categoryColor(category?: TileCategory): string {
  return category ? CATEGORY_ACCENTS[category] : colors.stampGold;
}

export function categoryWash(category: TileCategory | undefined, alpha = 0.14): string {
  return wash(categoryColor(category), alpha);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/** Slab-ish display face — heavy serif fallback until a real slab is bundled. */
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

export const type = {
  display: { fontFamily: serif, fontSize: 30, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.5 },
  h1: { fontFamily: serif, fontSize: 23, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.3 },
  h2: { fontSize: 16, fontWeight: '800' as const, color: colors.ink },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.ink },
  label: { fontSize: 12, fontWeight: '700' as const, color: colors.inkSoft, letterSpacing: 0.3 },
  tiny: { fontSize: 11, fontWeight: '600' as const, color: colors.inkFaint },
  kicker: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },

  // "Quiet" redesign faces — Fraunces (a softer, less scrapbook-y serif than the Georgia
  // `display`/`h1` above) for headlines, Manrope for everything else. Additive: existing
  // `type.*` keys above are untouched, so anything not explicitly redesigned keeps Georgia.
  // No negative letterSpacing here (an earlier -0.3 was removed) — on-device (not just
  // in the web preview this was designed in) it could pull adjacent glyphs of a short
  // display string (a two/three-letter card title, "Jin") close enough to visibly
  // collide/overlap, which read as the font being "distorted" rather than tightly
  // tracked. Fraunces' letterforms are wide and stylized enough not to need the extra
  // tightening a more neutral serif might.
  quietDisplay: { fontFamily: 'Fraunces_600SemiBold', fontSize: 26, color: colors.ink },
  quietQuote: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 15, lineHeight: 23, color: colors.inkSoft },
  quietLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: colors.inkQuietFaint, letterSpacing: 0.2 },
  quietBody: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.ink },
  quietButton: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.ink },
};

export const shadow = {
  card: {
    shadowColor: '#3A2E12',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  lift: {
    shadowColor: '#3A2E12',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
