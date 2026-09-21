/**
 * The curated idea bank the swipe deck pulls from — nobody types a tile, they choose one.
 * Sourced from real "new year bingo" / vision-board-bingo templates and comfort-zone
 * challenge lists (see DESIGN-FRAMEWORK.md for citations), rewritten short. ~80 ideas
 * across 8 categories so a 24-tile card comes together with real variety.
 */

import type { TileCategory } from './types';

export interface TileIdea {
  id: string;
  emoji: string;
  label: string;
  note: string;
  /** Absent for a hand-typed tile — it isn't from any bank category. */
  category?: TileCategory;
}

const RAW: Record<TileCategory, [string, string, string][]> = {
  // [emoji, label, note]
  comfort: [
    ['🗣️', 'Talk to a stranger', 'A real conversation with someone you don’t know.'],
    ['🎤', 'Speak up in a group', 'Say the thing in the meeting or class you’d normally sit out.'],
    ['🙋', 'Ask for a discount', 'Just ask. Worst case, they say no.'],
    ['🍽️', 'Eat alone at a restaurant', 'Sit down, order, enjoy your own company.'],
    ['📞', 'Make the call you’re avoiding', 'The one you keep texting around instead.'],
    ['🕺', 'Dance in public', 'Even just a little. Even if it’s bad.'],
    ['💬', 'Post something real online', 'An honest opinion, not a highlight reel.'],
    ['🎭', 'Try karaoke', 'Grab the mic. Nobody remembers a bad note.'],
    ['🚪', 'Show up alone to something', 'A party, a class, an event — solo.'],
    ['🤝', 'Introduce two people', 'Connect two friends who should know each other.'],
  ],
  adventure: [
    ['🌍', 'Visit a new country', ''],
    ['🏕️', 'Sleep under the stars', 'Camp somewhere with zero cell service.'],
    ['🛣️', 'No-destination road trip', 'Drive, and decide which way at every turn.'],
    ['🗺️', 'Explore a new neighborhood', 'On foot, no destination in mind.'],
    ['⛰️', 'Hike to a summit', ''],
    ['🚆', 'Take a solo trip', 'One night, one city, just you.'],
    ['🛶', 'Try a water sport', 'Kayak, surf, paddleboard — something new.'],
    ['🌆', 'Watch a sunrise somewhere new', ''],
    ['🏙️', 'Visit a city you know nothing about', ''],
    ['🎡', 'Ride something that scares you', 'A little. That’s the point.'],
  ],
  creative: [
    ['🎸', 'Learn an instrument', ''],
    ['🖌️', 'Take an art class', ''],
    ['📸', 'A photo a day, for a month', ''],
    ['✍️', 'Write something just for you', 'A poem, a story, a page a day.'],
    ['🧵', 'Learn a craft', 'Pottery, knitting, woodworking — something with your hands.'],
    ['🎬', 'Make something and share it', 'A video, a playlist, a zine.'],
    ['🎹', 'Learn one song, start to finish', ''],
    ['🖋️', 'Start the project you keep postponing', ''],
    ['🎨', 'Redecorate a space yourself', ''],
    ['📖', 'Read a genre you never touch', ''],
  ],
  health: [
    ['🏃', 'Run a 5K', ''],
    ['🧘', 'Try a new workout style', 'Yoga, boxing, climbing — something new.'],
    ['🥗', 'Cook 5 new recipes', ''],
    ['💧', 'Actually drink enough water', 'For a full week straight.'],
    ['🛌', 'Fix your sleep', 'Two weeks of a real bedtime.'],
    ['🧊', 'Take a cold shower', ''],
    ['🚴', 'Bike somewhere instead of driving', ''],
    ['🌿', 'A week with no added sugar', ''],
    ['🧗', 'Try a sport you’ve never played', ''],
    ['🩺', 'Get the check-up you’ve been putting off', ''],
  ],
  career: [
    ['💻', 'Learn to code', 'Even just the basics.'],
    ['🗣️', 'Learn a new language', 'Enough to get by.'],
    ['📄', 'Update your résumé', 'Even if you’re not looking.'],
    ['💰', 'Save your first $1,000', ''],
    ['🚀', 'Start a side project', ''],
    ['🎓', 'Take a course outside your field', ''],
    ['🤝', 'Ask someone to mentor you', ''],
    ['📈', 'Track your spending for a month', ''],
    ['🧾', 'Build a real budget', 'And actually stick to it.'],
    ['🏆', 'Ask for the raise', 'Or the promotion. Just ask.'],
  ],
  kindness: [
    ['🙏', 'An anonymous kind act', 'For a total stranger.'],
    ['💌', 'Write someone a real letter', 'Pen, paper, a stamp.'],
    ['📞', 'Call your parents every week', 'For a whole month.'],
    ['🍽️', 'Host a dinner', 'Cook for people you love.'],
    ['👋', 'Reconnect with someone', 'Someone you lost touch with.'],
    ['🎁', 'Give a gift for no reason', ''],
    ['🫂', 'Tell someone what they mean to you', ''],
    ['🤲', 'Volunteer for a cause you care about', ''],
    ['🧑‍🤝‍🧑', 'Make one new friend', 'This year. Just one.'],
    ['💐', 'Compliment a stranger', ''],
  ],
  fun: [
    ['🎢', 'Go to an amusement park', ''],
    ['🍜', 'Try a cuisine you’ve never had', ''],
    ['🎟️', 'Go to a concert', ''],
    ['🐾', 'Spend a day with animals', 'A shelter, a farm, an aquarium.'],
    ['🎲', 'Say yes to a plan', 'One you’d normally skip.'],
    ['🌶️', 'Order the weirdest thing on the menu', ''],
    ['🎃', 'Go all-in on a holiday', 'One you usually skip.'],
    ['🛍️', '$20 thrift-store outfit', 'Then wear it out.'],
    ['🌌', 'Stay up for the sunrise', ''],
    ['🎳', 'Try a game you’ve never played', ''],
  ],
  mindful: [
    ['📵', 'A full digital-detox day', ''],
    ['📓', 'Journal for two weeks straight', ''],
    ['🧘', 'Meditate for two weeks straight', ''],
    ['🛁', 'Take an actual day off', 'No errands, no guilt.'],
    ['🌤️', 'An hour outside, no phone', ''],
    ['🕯️', 'Build a wind-down routine', 'And actually keep it.'],
    ['🧹', 'Declutter a space that’s bothered you', ''],
    ['😌', 'Say no to something', 'Something that drains you.'],
    ['🙌', '3 wins, every Friday', 'Write them down.'],
    ['🌙', 'A week without checking the news', ''],
  ],
};

export const TILE_BANK: TileIdea[] = (Object.keys(RAW) as TileCategory[]).flatMap((category) =>
  RAW[category].map(([emoji, label, note], i) => ({
    id: `${category}_${i}`,
    emoji,
    label,
    note,
    category,
  }))
);

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * A shuffled deck that round-robins categories, so the swipe session doesn't clump —
 * five travel ideas in a row reads as repetitive, not varied.
 */
export function buildDeck(exclude: Set<string> = new Set()): TileIdea[] {
  const byCategory = (Object.keys(RAW) as TileCategory[]).map((cat) =>
    shuffle(TILE_BANK.filter((t) => t.category === cat && !exclude.has(t.id)))
  );
  const deck: TileIdea[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const bucket of byCategory) {
      const next = bucket.shift();
      if (next) {
        deck.push(next);
        remaining = true;
      }
    }
  }
  return deck;
}

export function randomSuggestions(exclude: Set<string>, n: number): TileIdea[] {
  return shuffle(TILE_BANK.filter((t) => !exclude.has(t.id))).slice(0, n);
}
