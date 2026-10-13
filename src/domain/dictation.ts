/**
 * iOS dictation — specifically tapping the mic button to manually stop it, rather than
 * letting it auto-finalize on a pause — can re-insert the whole just-spoken transcript a
 * second time instead of replacing the in-progress one. Confirmed from a screen
 * recording on two different text fields: the field's own native text literally became
 * "<phrase> <phrase>", the same multi-word phrase twice with exactly one space between,
 * not a display/wrapping artifact — the duplication happens in the native text buffer
 * itself, before any of this app's code runs, so there's no controlled/uncontrolled
 * TextInput trick that touches it. This catches that one exact, narrow pattern after the
 * fact instead.
 */

/** Collapses `"<phrase> <phrase>"` (the whole trimmed string split into two identical
 *  halves by a single space at the midpoint) down to one copy. Deliberately exact and
 *  narrow — anything short of a perfect whole-field duplicate is left untouched, so this
 *  never touches a word someone legitimately repeated on purpose (e.g. "no no"), since
 *  real repeats are rarely the *entire* field's content mirrored around one space. */
export function collapseDictationDuplicate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length % 2 === 0) return text;
  const mid = (trimmed.length - 1) / 2;
  if (trimmed[mid] !== ' ') return text;
  const first = trimmed.slice(0, mid);
  const second = trimmed.slice(mid + 1);
  return first.length > 0 && first === second ? first : text;
}
