/**
 * Synthesizes the reward sound bank into assets/sounds/*.wav.
 *
 * No binary assets are checked in or downloaded — run `node scripts/gen-sounds.js`
 * (also wired as `npm run gen:sounds`) and the five short WAV files are written from
 * pure math. 16-bit mono PCM, 44.1 kHz. Total size < 300 KB.
 *
 * Sounds (see DESIGN-FRAMEWORK.md):
 *   stamp.wav    - a tile crossed off. Sharp, punchy rubber-stamp snap.
 *   chord.wav    - a line completed (bingo). Rising C-E-G arpeggio.
 *   fanfare.wav  - a reward claimed. Three-note ascending bell/chime run.
 *   trophy.wav   - the whole card blacked out. Deep boom + fanfare + bell shimmer.
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

// --- tiny synth helpers -----------------------------------------------------

const noteHz = (name) => {
  // name like 'A5', 'C#4'
  const names = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const m = name.match(/^([A-G]#?)(\d)$/);
  const semis = names[m[1]] + (parseInt(m[2], 10) + 1) * 12; // MIDI-ish
  return 440 * Math.pow(2, (semis - 69) / 12);
};

/** Additive tone with a few harmonics + exponential decay envelope. */
function tone(buf, { startMs, durMs, freq, gain = 0.5, decay = 6, harmonics = [1, 0.35, 0.15], attackMs = 4 }) {
  const start = Math.floor((startMs / 1000) * SAMPLE_RATE);
  const dur = Math.floor((durMs / 1000) * SAMPLE_RATE);
  const attack = Math.max(1, Math.floor((attackMs / 1000) * SAMPLE_RATE));
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / SAMPLE_RATE;
    const env = (i < attack ? i / attack : 1) * Math.exp((-decay * i) / dur);
    let s = 0;
    harmonics.forEach((amp, h) => {
      s += amp * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    });
    buf[idx] += (s / harmonics.reduce((a, b) => a + b, 0)) * gain * env;
  }
}

/**
 * Bell/chime tone: inharmonic partials (unlike `tone`'s harmonic stack), each with its
 * own decay rate — the cheap-bell-synthesis trick that reads as a real chime instead of
 * a brassy fanfare.
 */
function bell(buf, { startMs, durMs, freq, gain = 0.5, decay = 3.2, attackMs = 6 }) {
  const start = Math.floor((startMs / 1000) * SAMPLE_RATE);
  const dur = Math.floor((durMs / 1000) * SAMPLE_RATE);
  const attack = Math.max(1, Math.floor((attackMs / 1000) * SAMPLE_RATE));
  const partials = [
    { ratio: 1, amp: 1, decayMul: 1 },
    { ratio: 2.0, amp: 0.55, decayMul: 1.6 },
    { ratio: 2.76, amp: 0.32, decayMul: 2.2 },
    { ratio: 4.07, amp: 0.18, decayMul: 3 },
  ];
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / SAMPLE_RATE;
    const att = i < attack ? i / attack : 1;
    let s = 0;
    for (const p of partials) {
      const env = Math.exp((-decay * p.decayMul * i) / dur);
      s += p.amp * env * Math.sin(2 * Math.PI * freq * p.ratio * t);
    }
    buf[idx] += s * gain * att * 0.4;
  }
}

/** Deep sub-bass hit with a falling pitch envelope — a cinematic "boom." */
function boom(buf, { startMs, durMs, freq = 70, gain = 0.9, decay = 7 }) {
  const start = Math.floor((startMs / 1000) * SAMPLE_RATE);
  const dur = Math.floor((durMs / 1000) * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const frac = i / dur;
    const f = freq * (1 + 1.6 * Math.exp(-9 * frac)); // pitch falls fast from ~2.6x
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    const env = Math.exp((-decay * i) / dur);
    buf[idx] += Math.sin(phase) * gain * env;
  }
}

/** Short filtered-noise click. */
function click(buf, { startMs, durMs, gain = 0.4, tilt = 0.6 }) {
  const start = Math.floor((startMs / 1000) * SAMPLE_RATE);
  const dur = Math.floor((durMs / 1000) * SAMPLE_RATE);
  let prev = 0;
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const env = Math.exp((-9 * i) / dur);
    const n = Math.random() * 2 - 1;
    prev = tilt * prev + (1 - tilt) * n; // 1-pole lowpass
    buf[idx] += prev * gain * env;
  }
}

function render(durMs, build) {
  const len = Math.ceil((durMs / 1000) * SAMPLE_RATE) + 8;
  const buf = new Float64Array(len);
  build(buf);
  // soft-clip / normalize
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const norm = peak > 0 ? 0.92 / peak : 1;
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    let v = Math.tanh(buf[i] * norm) * 0.98;
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  return pcm;
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// --- the sound bank -------------------------------------------------------

const sounds = {
  // Punchy rubber-stamp snap: a hard bright transient + a short, tight low body —
  // shorter and sharper than a "thunk," reads as an immediate crack instead of a thud.
  stamp: () =>
    render(120, (b) => {
      click(b, { startMs: 0, durMs: 16, gain: 1.0, tilt: 0.2 });
      tone(b, { startMs: 1, durMs: 95, freq: 132, gain: 0.7, decay: 17, harmonics: [1, 0.4], attackMs: 0.5 });
      tone(b, { startMs: 1, durMs: 40, freq: 340, gain: 0.22, decay: 22, harmonics: [1], attackMs: 0.5 });
    }),

  chord: () =>
    render(760, (b) => {
      tone(b, { startMs: 0, durMs: 620, freq: noteHz('C5'), gain: 0.5, decay: 5 });
      tone(b, { startMs: 90, durMs: 560, freq: noteHz('E5'), gain: 0.5, decay: 5 });
      tone(b, { startMs: 180, durMs: 560, freq: noteHz('G5'), gain: 0.5, decay: 4.5 });
      tone(b, { startMs: 180, durMs: 560, freq: noteHz('C6'), gain: 0.28, decay: 5 });
    }),

  // A reward claimed: three ascending bell notes, bright register, long soft decays —
  // a genuine chime rather than a brassy fanfare arpeggio.
  fanfare: () =>
    render(1100, (b) => {
      const seq = [['E6', 0], ['G6', 140], ['C7', 300]];
      seq.forEach(([n, at]) => bell(b, { startMs: at, durMs: 850, freq: noteHz(n), gain: 0.65 }));
    }),

  // BLACKOUT — the whole card, every square. Deep boom, then a fuller ascending run,
  // then a bell-partial shimmer tail (darker/bigger than the reward chime).
  trophy: () =>
    render(1700, (b) => {
      boom(b, { startMs: 0, durMs: 260, freq: 65, gain: 1.0 });
      const seq = [['C5', 60], ['E5', 170], ['G5', 280], ['C6', 400], ['E6', 520]];
      seq.forEach(([n, at]) => tone(b, { startMs: at, durMs: 1000, freq: noteHz(n), gain: 0.42, decay: 3 }));
      for (let k = 0; k < 6; k++) {
        bell(b, { startMs: 700 + k * 80, durMs: 500, freq: noteHz('C7') * (1 + k * 0.04), gain: 0.3, decay: 4 });
      }
    }),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  const file = path.join(OUT_DIR, `${name}.wav`);
  fs.writeFileSync(file, wav(make()));
  console.log('wrote', path.relative(path.join(__dirname, '..'), file), fs.statSync(file).size, 'bytes');
}
