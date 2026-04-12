import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getUserUploadDir, UPLOAD_BASE, ALLOWED_EXTENSIONS } from "../lib/adventureStorage";

const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const userId = req.user?.id;
    if (!userId) return cb(new Error("Unauthorized"), "");
    cb(null, getUserUploadDir(userId));
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only jpg, png, gif, and webp files are allowed"));
    }
  },
});

function handleMulterError(err: Error | multer.MulterError | undefined, _req: Request, res: Response, next: NextFunction) {
  if (!err) { next(); return; }
  res.status(400).json({ error: err instanceof multer.MulterError ? err.message : (err.message || "Upload failed") });
}

async function resizeImage(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".gif") return; // skip animated GIFs
  const tmp = filePath + ".tmp";
  await sharp(filePath)
    .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
    .toFile(tmp);
  fs.renameSync(tmp, filePath);
}

const router = Router();

router.post("/adventure/images", (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}, upload.single("image"), handleMulterError, async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    await resizeImage(req.file.path);
  } catch {
    // resize failed — keep original file as-is
  }
  const size = fs.statSync(req.file.path).size;
  res.json({ filename: req.file.filename, size });
});

router.get("/adventure/images", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let userId = req.user!.id;
  const queryUserId = req.query.userId as string | undefined;
  if (queryUserId && queryUserId !== userId) {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!dbUser || dbUser.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    userId = queryUserId;
  }
  const dir = getUserUploadDir(userId);
  try {
    const files = fs.readdirSync(dir).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });
    const fileList = files.map((f) => {
      const stats = fs.statSync(path.join(dir, f));
      return { filename: f, size: stats.size };
    });
    res.json(fileList);
  } catch {
    res.json([]);
  }
});

router.delete("/adventure/images/:filename", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(getUserUploadDir(userId), filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ deleted: true });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

router.get("/adventure/uploads/:userId/:filename", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const requestingUserId = req.user!.id;
  const { userId, filename } = req.params;
  if (requestingUserId !== userId) {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, requestingUserId));
    if (!dbUser || dbUser.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(UPLOAD_BASE, userId, safeName);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;
