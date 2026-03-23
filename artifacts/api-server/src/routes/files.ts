import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, filesTable, usersTable } from "@workspace/db";
import {
  ListFilesQueryParams,
  ListFilesResponse,
  CreateFileBody,
  GetFileParams,
  GetFileResponse,
  UpdateFileParams,
  UpdateFileBody,
  UpdateFileResponse,
  DeleteFileParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/files", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const params = ListFilesQueryParams.safeParse(req.query);
  let targetUserId = req.user.id;

  if (params.success && params.data.userId) {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (currentUser?.role !== "admin") {
      res.status(403).json({ error: "Only admin can view other students' files" });
      return;
    }
    targetUserId = params.data.userId;
  }

  const files = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.userId, targetUserId));

  res.json(ListFilesResponse.parse(files));
});

router.post("/files", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [file] = await db
    .insert(filesTable)
    .values({
      userId: req.user.id,
      filename: parsed.data.filename,
      content: parsed.data.content ?? "",
    })
    .returning();

  res.status(201).json(GetFileResponse.parse(file));
});

router.get("/files/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const params = GetFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, params.data.id));

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (file.userId !== req.user.id && currentUser?.role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(GetFileResponse.parse(file));
});

router.patch("/files/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const params = UpdateFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateFileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db.select().from(filesTable).where(eq(filesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (existing.userId !== req.user.id && currentUser?.role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const updateData: Record<string, string> = {};
  if (body.data.content !== undefined) updateData.content = body.data.content;
  if (body.data.filename !== undefined) updateData.filename = body.data.filename;

  const [updated] = await db
    .update(filesTable)
    .set(updateData)
    .where(eq(filesTable.id, params.data.id))
    .returning();

  res.json(UpdateFileResponse.parse(updated));
});

router.delete("/files/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const params = DeleteFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(filesTable).where(eq(filesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  if (existing.userId !== req.user.id) {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (currentUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  await db.delete(filesTable).where(eq(filesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
