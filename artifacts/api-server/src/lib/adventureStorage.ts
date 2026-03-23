import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Use persistent volume on Fly.io (/data), fall back to /tmp for local dev
export const UPLOAD_BASE = process.env.UPLOAD_DIR || (
  process.env.NODE_ENV === "production" ? "/data/uploads" : path.join(os.tmpdir(), "pylearn_uploads")
);
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function getUserUploadDir(userId: string): string {
  const dir = path.join(UPLOAD_BASE, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
