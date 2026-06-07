import { test } from "node:test";
import assert from "node:assert/strict";
import { safeScriptFilename, isUnsafePathSegment, getSafeReturnTo } from "./safety";

test("safeScriptFilename keeps ordinary names", () => {
  assert.equal(safeScriptFilename("main.py"), "main.py");
  assert.equal(safeScriptFilename("my_adventure.py"), "my_adventure.py");
});

test("safeScriptFilename strips directory traversal and absolute paths", () => {
  assert.equal(safeScriptFilename("../../../etc/passwd"), "passwd");
  assert.equal(safeScriptFilename("/abs/path/script.py"), "script.py");
  assert.equal(safeScriptFilename("..\\..\\windows\\evil.py"), "evil.py");
  assert.equal(safeScriptFilename("foo/../bar.py"), "bar.py");
});

test("safeScriptFilename replaces unsafe chars and leading dots", () => {
  assert.equal(safeScriptFilename("a b.py"), "a_b.py");
  assert.equal(safeScriptFilename("na;me$.py"), "na_me_.py");
  assert.equal(safeScriptFilename("...hidden.py"), "hidden.py");
});

test("safeScriptFilename falls back on empty/invalid", () => {
  assert.equal(safeScriptFilename(""), "script.py");
  assert.equal(safeScriptFilename(".."), "script.py");
  assert.equal(safeScriptFilename("/"), "script.py");
  assert.equal(safeScriptFilename(undefined), "script.py");
  assert.equal(safeScriptFilename(123 as unknown as string, "x.py"), "x.py");
});

test("isUnsafePathSegment accepts real ids, rejects traversal", () => {
  assert.equal(isUnsafePathSegment("teacher-demo"), false);
  assert.equal(isUnsafePathSegment("1029384756"), false);
  assert.equal(isUnsafePathSegment("a1b2-c3d4"), false);

  assert.equal(isUnsafePathSegment(""), true);
  assert.equal(isUnsafePathSegment(".."), true);
  assert.equal(isUnsafePathSegment("a/b"), true);
  assert.equal(isUnsafePathSegment("a\\b"), true);
  assert.equal(isUnsafePathSegment("a..b"), true);
  assert.equal(isUnsafePathSegment("x\0y"), true);
  assert.equal(isUnsafePathSegment(undefined), true);
});

test("getSafeReturnTo only allows same-origin absolute paths", () => {
  assert.equal(getSafeReturnTo("/admin"), "/admin");
  assert.equal(getSafeReturnTo("/a?b=1#c"), "/a?b=1#c");
  assert.equal(getSafeReturnTo("//evil.com"), "/");
  assert.equal(getSafeReturnTo("https://evil.com"), "/");
  assert.equal(getSafeReturnTo("relative"), "/");
  assert.equal(getSafeReturnTo(""), "/");
  assert.equal(getSafeReturnTo(undefined), "/");
});
