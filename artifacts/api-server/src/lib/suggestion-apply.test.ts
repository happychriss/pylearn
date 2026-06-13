import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatch, isIndentOnly, applyChanges } from "./suggestion-apply";

test("findMatch: unique exact match", () => {
  const m = findMatch("abc\ndef\nghi", "def");
  assert.deepEqual(m, { kind: "found", index: 4, length: 3 });
});

test("findMatch: ambiguous exact match reports the count", () => {
  assert.deepEqual(findMatch("x = 1\nx = 1", "x = 1"), { kind: "ambiguous", count: 2 });
});

test("findMatch: missing anchor", () => {
  assert.deepEqual(findMatch("a = 1\n", "zzz"), { kind: "missing" });
});

test("findMatch: whitespace-normalised fallback", () => {
  // Different indentation/casing than the file — normalised match still locates it.
  const content = "def f():\n    print('hi')\n";
  const m = findMatch(content, "print('hi')");
  assert.ok(m.kind === "found" && content.slice(m.index, m.index + m.length).includes("print('hi')"));
});

test("isIndentOnly", () => {
  assert.equal(isIndentOnly("  x = 1", "    x = 1"), true);
  assert.equal(isIndentOnly("x = 1", "x = 2"), false);
  assert.equal(isIndentOnly("a\nb", "a\nb\nc"), false);
});

test("applyChanges: single replacement", () => {
  const r = applyChanges("a = 1\nb = 2\n", [{ old_text: "b = 2", new_text: "b = 3" }]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result, "a = 1\nb = 3\n");
});

test("applyChanges: CRLF is normalised before matching", () => {
  const r = applyChanges("a = 1\r\nb = 2\r\n", [{ old_text: "b = 2", new_text: "b = 3" }]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result, "a = 1\nb = 3\n");
});

test("applyChanges: not found yields an error", () => {
  const r = applyChanges("a = 1\n", [{ old_text: "zzz = 9", new_text: "q" }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Could not find/);
});

test("applyChanges: ambiguous non-indent change errors with a truthful message", () => {
  const r = applyChanges("x = 1\nx = 1\n", [{ old_text: "x = 1", new_text: "x = 9" }]);
  assert.equal(r.ok, false);
  // Must say the anchor is non-unique, NOT "could not find" (it IS in the file).
  if (!r.ok) {
    assert.match(r.error, /appears 2 times/);
    assert.doesNotMatch(r.error, /Could not find/);
  }
});

test("applyChanges: duplicate goto anchor (turtle_03_house regression) is reported as ambiguous", () => {
  // The prod turtle_03_house.py has `t.goto(250, 300)` twice (house body + roof).
  // A bare-line anchor must surface as ambiguous, not a confusing "could not find".
  const content = "t.penup()\nt.goto(250, 300)\nt.pendown()\n# roof\nt.penup()\nt.goto(250, 300)\nt.pendown()\n";
  const r = applyChanges(content, [{ old_text: "t.goto(250, 300)", new_text: "t.goto(250, 250)" }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /appears 2 times/);
});

test("applyChanges: indentation-only fix patches all occurrences", () => {
  const content = "    t.penup()\nfoo\n    t.penup()\n";
  const r = applyChanges(content, [{ old_text: "    t.penup()", new_text: "t.penup()" }]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result, "t.penup()\nfoo\nt.penup()\n");
});

test("applyChanges: multiple sequential changes", () => {
  const r = applyChanges("import x\nrun()\n", [
    { old_text: "import x", new_text: "import x\nimport y" },
    { old_text: "run()", new_text: "run(y)" },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result, "import x\nimport y\nrun(y)\n");
});
