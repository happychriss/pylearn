/**
 * Universal display protocol parser (pure / no I/O — unit-testable).
 *
 * Python code emits rich output via null-byte delimited markers in stdout:
 *   \x00PYLEARN_DISPLAY\x00{"mime":"...","data":...}\x00
 * These markers are stripped from the terminal stream and the JSON is parsed
 * into display events. Markers can be split across PTY chunks, so parsing is
 * stateful via a carry-over buffer string.
 */

export interface DisplayMessage {
  mime: string;
  data: unknown;
  id?: string;
  append?: boolean;
}

export const DISPLAY_START = "\x00PYLEARN_DISPLAY\x00";
export const DISPLAY_END = "\x00";

export interface ParsedChunk {
  /** Terminal text with all complete markers stripped out. */
  output: string;
  /** Carry-over to prepend to the next chunk (partial marker / unterminated JSON). */
  buffer: string;
  /** Fully-parsed, valid display events found in this chunk. */
  events: DisplayMessage[];
}

/**
 * Parse one chunk of PTY output, given the carry-over buffer from the previous
 * call. Returns the cleaned terminal text, the new carry-over buffer, and any
 * complete display events.
 */
export function parseDisplayChunk(prevBuffer: string, data: string): ParsedChunk {
  let input = prevBuffer + data;
  let output = "";
  const events: DisplayMessage[] = [];

  while (true) {
    const startIdx = input.indexOf(DISPLAY_START);
    if (startIdx === -1) {
      // No complete start marker. Check whether the tail is a partial start
      // marker (e.g. ends with "\x00PYL") that should be held for the next chunk.
      for (let i = Math.max(0, input.length - DISPLAY_START.length); i < input.length; i++) {
        const tail = input.slice(i);
        if (DISPLAY_START.startsWith(tail) && tail.length < DISPLAY_START.length) {
          output += input.slice(0, i);
          return { output, buffer: tail, events };
        }
      }
      output += input;
      return { output, buffer: "", events };
    }

    // Emit everything before the marker.
    output += input.slice(0, startIdx);

    const jsonStart = startIdx + DISPLAY_START.length;
    const endIdx = input.indexOf(DISPLAY_END, jsonStart);
    if (endIdx === -1) {
      // Incomplete marker — buffer from the start marker for the next chunk.
      return { output, buffer: input.slice(startIdx), events };
    }

    const jsonStr = input.slice(jsonStart, endIdx);
    try {
      const msg = JSON.parse(jsonStr) as DisplayMessage;
      if (msg.mime && msg.data !== undefined) events.push(msg);
    } catch (err) {
      console.error("[display-protocol] Malformed display marker JSON:", err);
    }

    input = input.slice(endIdx + 1);
  }
}
