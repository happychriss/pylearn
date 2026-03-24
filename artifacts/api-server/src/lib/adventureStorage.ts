import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Use persistent volume on Fly.io (/data), fall back to /tmp for local dev
// Note: NODE_ENV is replaced at build time by esbuild, so we detect Fly via FLY_APP_NAME instead
export const UPLOAD_BASE = process.env.UPLOAD_DIR || (
  process.env.FLY_APP_NAME ? "/data/uploads" : path.join(os.tmpdir(), "pylearn_uploads")
);
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function getUserUploadDir(userId: string): string {
  const dir = path.join(UPLOAD_BASE, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
