import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDisplayChunk, DISPLAY_START, DISPLAY_END } from "./display-protocol";

const marker = (obj: unknown) => `${DISPLAY_START}${JSON.stringify(obj)}${DISPLAY_END}`;

test("plain text passes through untouched", () => {
  const r = parseDisplayChunk("", "hello world\n");
  assert.equal(r.output, "hello world\n");
  assert.equal(r.buffer, "");
  assert.deepEqual(r.events, []);
});

test("a single complete marker is parsed and stripped", () => {
  const r = parseDisplayChunk("", `before${marker({ mime: "text/plain", data: "x" })}after`);
  assert.equal(r.output, "beforeafter");
  assert.equal(r.buffer, "");
  assert.deepEqual(r.events, [{ mime: "text/plain", data: "x" }]);
});

test("multiple markers in one chunk", () => {
  const data = marker({ mime: "a", data: 1 }) + "mid" + marker({ mime: "b", data: 2 });
  const r = parseDisplayChunk("", data);
  assert.equal(r.output, "mid");
  assert.equal(r.events.length, 2);
  assert.equal(r.events[0].mime, "a");
  assert.equal(r.events[1].mime, "b");
});

test("a start marker split across chunks is buffered then completed", () => {
  const full = marker({ mime: "text/plain", data: "ok" });
  const splitAt = 5; // somewhere inside DISPLAY_START
  const first = parseDisplayChunk("", "out" + full.slice(0, splitAt));
  assert.equal(first.output, "out");
  assert.equal(first.events.length, 0);
  assert.notEqual(first.buffer, "");

  const second = parseDisplayChunk(first.buffer, full.slice(splitAt) + "tail");
  assert.equal(second.output, "tail");
  assert.deepEqual(second.events, [{ mime: "text/plain", data: "ok" }]);
  assert.equal(second.buffer, "");
});

test("unterminated JSON is buffered until the closing chunk", () => {
  const json = JSON.stringify({ mime: "text/plain", data: "hello" });
  const cut = json.length - 4;
  const first = parseDisplayChunk("", DISPLAY_START + json.slice(0, cut));
  assert.equal(first.output, "");
  assert.equal(first.events.length, 0);
  assert.ok(first.buffer.startsWith(DISPLAY_START));

  const second = parseDisplayChunk(first.buffer, json.slice(cut) + DISPLAY_END);
  assert.deepEqual(second.events, [{ mime: "text/plain", data: "hello" }]);
});

test("malformed marker JSON is dropped without throwing", () => {
  const r = parseDisplayChunk("", `a${DISPLAY_START}{not valid json}${DISPLAY_END}b`);
  assert.equal(r.events.length, 0);
  assert.equal(r.output, "ab");
});

test("marker missing mime/data is ignored", () => {
  const r = parseDisplayChunk("", marker({ mime: "", data: "x" }) + marker({ foo: 1 }));
  assert.deepEqual(r.events, []);
});
