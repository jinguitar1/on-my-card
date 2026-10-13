/**
 * Short, second-person lines shown for a moment when a reward is claimed — reframing
 * the win as identity progress rather than just "claimed." Self-perception research ties
 * this framing to better follow-through than a generic congratulations (see
 * DESIGN-FRAMEWORK.md).
 */

const LINES: string[] = [
  "You're becoming someone who follows through.",
  'This is what showing up for yourself looks like.',
  "That's not luck. That's consistency.",
  "Proof: you do what you say you'll do.",
  "You're the kind of person who finishes what they start.",
  'Small proof, real pattern.',
  'This is who you are now, not who you were trying to be.',
  "Nobody saw that but you. That's the point.",
];

export function randomIdentityLine(): string {
  return LINES[Math.floor(Math.random() * LINES.length)];
}
