import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { PYLEARN_LIBRARY_REFERENCE } from "../lib/pylearn-ref";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db, usersTable, aiConfigTable, helpRequestsTable, filesTable, studentAccountsTable, sessionsTable } from "@workspace/db";
import {
  ListStudentsResponse,
  GetAiConfigResponse,
  UpdateAiConfigBody,
  UpdateAiConfigResponse,
  CreateStudentAccountBody,
  ListStudentAccountsResponse,
  ToggleStudentPauseBody,
} from "@workspace/api-zod";
import { onlineUsers } from "../lib/wsState";
import { closeUserConnections, broadcastToStudents } from "../lib/websocket";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

/** Invalidates all active sessions for a given student (e.g. on pause or delete). */
async function invalidateStudentSessions(studentId: string): Promise<void> {
  const allSessions = await db.select().from(sessionsTable);
  for (const session of allSessions) {
    const sess = session.sess as unknown as { user?: { id?: string } };
    if (sess?.user?.id === studentId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, session.sid));
    }
  }
}

function generatePin(): string {
  return String(crypto.randomInt(100000, 1000000));
}

router.get("/admin/workspace/:studentId", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const studentFiles = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.userId, req.params.studentId));

  res.json(studentFiles);
});

router.get("/admin/class-roster", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const students = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "student"));

  const activeHelp = await db
    .select()
    .from(helpRequestsTable)
    .where(eq(helpRequestsTable.status, "active"));

  const helpUserIds = new Set(activeHelp.map((h) => h.userId));

  const result = students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    profileImageUrl: s.profileImageUrl,
    role: s.role,
    isOnline: onlineUsers.has(s.id),
    hasHelpRequest: helpUserIds.has(s.id),
  }));

  res.json(ListStudentsResponse.parse(result));
});

router.post("/admin/students", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = CreateStudentAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { displayName } = parsed.data;
  const pin = generatePin();
  const pinHash = await bcrypt.hash(pin, 10);
  const id = crypto.randomUUID();

  const account = await db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id,
      firstName: displayName,
      role: "student",
    });

    await tx.insert(studentAccountsTable).values({
      id,
      displayName,
      pinHash,
      pinPlain: pin,
      createdByAdminId: req.user!.id,
    });

    const [created] = await tx
      .select()
      .from(studentAccountsTable)
      .where(eq(studentAccountsTable.id, id));

    return created;
  });

  res.status(201).json({
    id: account.id,
    displayName: account.displayName,
    pin,
    createdAt: account.createdAt,
  });
});

router.get("/admin/students", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const accounts = await db.select().from(studentAccountsTable);

  const activeHelp = await db
    .select()
    .from(helpRequestsTable)
    .where(eq(helpRequestsTable.status, "active"));

  const helpUserIds = new Set(activeHelp.map((h) => h.userId));

  const result = accounts.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    pin: a.pinPlain,
    isPaused: a.isPaused,
    aiCredits: a.aiCredits,
    createdAt: a.createdAt,
    isOnline: onlineUsers.has(a.id),
    hasHelpRequest: helpUserIds.has(a.id),
  }));

  res.json(ListStudentAccountsResponse.parse(result));
});

router.patch("/admin/students/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = ToggleStudentPauseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { isPaused } = parsed.data;
  const studentId = req.params.id;

  const [account] = await db
    .select()
    .from(studentAccountsTable)
    .where(eq(studentAccountsTable.id, studentId));

  if (!account) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  await db
    .update(studentAccountsTable)
    .set({ isPaused })
    .where(eq(studentAccountsTable.id, studentId));

  if (isPaused) {
    closeUserConnections(studentId);
    await invalidateStudentSessions(studentId);
  }

  const activeHelp = await db
    .select()
    .from(helpRequestsTable)
    .where(eq(helpRequestsTable.status, "active"));
  const helpUserIds = new Set(activeHelp.map((h) => h.userId));

  res.json({
    id: studentId,
    displayName: account.displayName,
    isPaused,
    createdAt: account.createdAt,
    isOnline: onlineUsers.has(studentId),
    hasHelpRequest: helpUserIds.has(studentId),
  });
});

router.delete("/admin/students/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const studentId = req.params.id;

  const [account] = await db
    .select()
    .from(studentAccountsTable)
    .where(eq(studentAccountsTable.id, studentId));

  if (!account) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  closeUserConnections(studentId);
  await invalidateStudentSessions(studentId);

  await db.transaction(async (tx) => {
    await tx.delete(filesTable).where(eq(filesTable.userId, studentId));
    await tx.delete(helpRequestsTable).where(eq(helpRequestsTable.userId, studentId));
    await tx.delete(studentAccountsTable).where(eq(studentAccountsTable.id, studentId));
    await tx.delete(usersTable).where(eq(usersTable.id, studentId));
  });

  const uploadsDir = path.join(os.tmpdir(), `pylearn_uploads_${studentId}`);
  try {
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort disk cleanup
  }

  res.json({ success: true });
});

router.patch("/admin/students/:id/credits", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const studentId = req.params.id;
  const { aiCredits } = req.body;

  if (typeof aiCredits !== "number" || aiCredits < 0) {
    res.status(400).json({ error: "aiCredits must be a non-negative number" });
    return;
  }

  const [account] = await db
    .select()
    .from(studentAccountsTable)
    .where(eq(studentAccountsTable.id, studentId));

  if (!account) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  await db
    .update(studentAccountsTable)
    .set({ aiCredits })
    .where(eq(studentAccountsTable.id, studentId));

  res.json({ id: studentId, aiCredits });
});

router.get("/admin/ai-library-ref", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  res.json({ content: PYLEARN_LIBRARY_REFERENCE });
});

router.get("/admin/ai-config", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  let [config] = await db.select().from(aiConfigTable);

  if (!config) {
    [config] = await db.insert(aiConfigTable).values({}).returning();
  }

  const safeConfig = { ...config, apiKey: config.apiKey ? "********" : null };
  res.json(GetAiConfigResponse.parse(safeConfig));
});

router.put("/admin/ai-config", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = UpdateAiConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [config] = await db.select().from(aiConfigTable);

  if (!config) {
    [config] = await db.insert(aiConfigTable).values({}).returning();
  }

  const updateData: Record<string, string> = {};
  if (parsed.data.provider !== undefined) updateData.provider = parsed.data.provider;
  if (parsed.data.mode !== undefined) updateData.mode = parsed.data.mode;
  if (parsed.data.apiKey !== undefined && parsed.data.apiKey !== null) {
    if (parsed.data.apiKey && !parsed.data.apiKey.startsWith("ENV:")) {
      const envName = `AI_API_KEY_${(parsed.data.provider || config.provider).toUpperCase()}`;
      process.env[envName] = parsed.data.apiKey;
      updateData.apiKey = `ENV:${envName}`;
    } else {
      updateData.apiKey = parsed.data.apiKey;
    }
  }
  if (parsed.data.suggestionSystemPrompt !== undefined) updateData.suggestionSystemPrompt = parsed.data.suggestionSystemPrompt;
  if (parsed.data.agentSystemPrompt !== undefined) updateData.agentSystemPrompt = parsed.data.agentSystemPrompt;
  if (parsed.data.offSystemPrompt !== undefined) updateData.offSystemPrompt = parsed.data.offSystemPrompt;
  if (parsed.data.chatSystemPrompt !== undefined) updateData.chatSystemPrompt = parsed.data.chatSystemPrompt;

  const modeChanged = parsed.data.mode !== undefined && parsed.data.mode !== config.mode;

  const [updated] = await db
    .update(aiConfigTable)
    .set(updateData)
    .where(eq(aiConfigTable.id, config.id))
    .returning();

  if (modeChanged) {
    broadcastToStudents({ type: "ai-mode-changed", mode: updated.mode });
  }

  const safeUpdated = { ...updated, apiKey: updated.apiKey ? "********" : null };
  res.json(UpdateAiConfigResponse.parse(safeUpdated));
});

export default router;
