/**
 * Pure logic for applying AI "old_text -> new_text" code suggestions to a file.
 * No I/O or external deps, so it can be unit-tested directly.
 */

export interface RawChange {
  old_text: string;
  new_text: string;
}

/** Outcome of locating an anchor in the file. "ambiguous" carries the occurrence
 *  count so callers can tell the user the anchor was found but not unique — a very
 *  different (and fixable) problem from a missing anchor. */
export type MatchResult =
  | { kind: "found"; index: number; length: number }
  | { kind: "ambiguous"; count: number }
  | { kind: "missing" };

/** Count non-overlapping occurrences of needle in haystack (needle assumed non-empty). */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return count;
    count++;
    from = i + needle.length;
  }
}

/** Try to locate oldText in content using progressively looser matching. */
export function findMatch(content: string, oldText: string): MatchResult {
  // 1. Exact match
  const exact = content.indexOf(oldText);
  if (exact !== -1) {
    const count = countOccurrences(content, oldText);
    if (count > 1) return { kind: "ambiguous", count };
    return { kind: "found", index: exact, length: oldText.length };
  }

  // 2. Normalised match: collapse runs of whitespace on each line, case-insensitive
  const normalise = (s: string) =>
    s.split('\n').map(l => l.trim().replace(/\s+/g, ' ').toLowerCase()).join('\n');

  const normContent = normalise(content);
  const normOld = normalise(oldText);
  const normIdx = normContent.indexOf(normOld);
  if (normIdx === -1) return { kind: "missing" };
  if (countOccurrences(normContent, normOld) > 1) {
    return { kind: "ambiguous", count: countOccurrences(normContent, normOld) };
  }

  // Map normalised index back to original content
  // Walk both strings together to find the real start/end positions
  let ci = 0; // original content index
  let ni = 0; // normalised content index
  let realStart = -1;
  let realEnd = -1;

  while (ci < content.length && ni <= normContent.length) {
    if (ni === normIdx) realStart = ci;
    if (ni === normIdx + normOld.length) { realEnd = ci; break; }
    // Advance one char in both (normalise() maps 1:1 for non-whitespace,
    // but collapses whitespace runs — advance original past any whitespace run)
    if (content[ci] === '\n') { ci++; ni++; }
    else if (/\s/.test(content[ci])) {
      // skip whitespace run in original; normalised already has single space or nothing
      while (ci < content.length && /\s/.test(content[ci]) && content[ci] !== '\n') ci++;
      if (ni < normContent.length && normContent[ni] === ' ') ni++;
    } else { ci++; ni++; }
  }

  if (realStart === -1 || realEnd === -1) return { kind: "missing" };

  // Ambiguity check on the real slice
  const realSlice = content.slice(realStart, realEnd);
  const sliceCount = countOccurrences(content, realSlice);
  if (sliceCount > 1) return { kind: "ambiguous", count: sliceCount };

  return { kind: "found", index: realStart, length: realEnd - realStart };
}

/** Returns true when old and new differ only in leading/trailing whitespace per line
 *  (i.e. an indentation-only fix — no actual code was changed). */
export function isIndentOnly(oldText: string, newText: string): boolean {
  const ol = oldText.split('\n');
  const nl = newText.split('\n');
  return ol.length === nl.length && ol.every((l, i) => l.trim() === nl[i].trim());
}

/** Apply a list of old_text → new_text changes to fileContent.
 *  Each old_text must match exactly once — unless it is an indentation-only fix that
 *  appears multiple times, in which case all occurrences are patched at once. */
export function applyChanges(
  fileContent: string,
  changes: RawChange[],
): { ok: true; result: string } | { ok: false; error: string } {
  let content = fileContent.replace(/\r\n/g, '\n');

  for (const change of changes) {
    const oldText = change.old_text.replace(/\r\n/g, '\n');
    const newText = change.new_text.replace(/\r\n/g, '\n');

    const match = findMatch(content, oldText);
    if (match.kind !== "found") {
      // Fallback: indentation-only fix that appears multiple times → patch all occurrences.
      // The AI correctly identifies the bad-indented line but can't provide a unique anchor
      // when the same line repeats (e.g. " t.penup()" appears 5× in one function block).
      // Safe to apply everywhere because the change is whitespace-only.
      if (isIndentOnly(oldText, newText) && content.includes(oldText)) {
        content = content.split(oldText).join(newText);
        continue;
      }
      const preview = oldText.split('\n')[0].trim().slice(0, 60);
      if (match.kind === "ambiguous") {
        // The anchor IS in the file but appears more than once, so we can't tell which
        // occurrence to change. Report it truthfully (not "could not find") so the user
        // can re-ask with more surrounding lines.
        return {
          ok: false,
          error: `Anchor "${preview}" appears ${match.count} times — needs more surrounding lines to identify which one to change`,
        };
      }
      return { ok: false, error: `Could not find: "${preview}"` };
    }

    content = content.slice(0, match.index) + newText + content.slice(match.index + match.length);
  }

  return { ok: true, result: content };
}
