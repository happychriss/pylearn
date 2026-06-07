/**
 * Small, dependency-free safety helpers for untrusted client input.
 * Kept pure and side-effect-free so they can be unit-tested in isolation.
 */

/**
 * Reduce a client-supplied filename to a safe basename that can never escape
 * the working directory. Drops any directory components (handles "../", "/abs",
 * "C:\\win"), restricts to a conservative allow-list, and strips leading dots.
 * Falls back to `fallback` when nothing usable remains.
 */
export function safeScriptFilename(name: unknown, fallback = "script.py"): string {
  if (typeof name !== "string") return fallback;
  // Take the basename only — split on both slash styles and keep the last segment.
  let base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  // Allow only filename-safe characters; everything else becomes "_".
  base = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Strip leading dots so "..", "...", ".hidden" can't sneak through.
  base = base.replace(/^\.+/, "");
  return base.length > 0 ? base : fallback;
}

/**
 * True when a single path segment (e.g. a userId used to build a filesystem
 * path) is unsafe to interpolate into a path. Rejects empty, separators, null
 * bytes, and any traversal sequence.
 */
export function isUnsafePathSegment(seg: unknown): boolean {
  return (
    typeof seg !== "string" ||
    seg.length === 0 ||
    seg.includes("/") ||
    seg.includes("\\") ||
    seg.includes("\0") ||
    seg === "." ||
    seg === ".." ||
    seg.includes("..")
  );
}

/**
 * Validate an OAuth/return-to redirect target. Only same-origin absolute paths
 * are allowed; anything that could become an off-site redirect ("//evil.com",
 * "http://…", non-string) collapses to "/".
 */
export function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
