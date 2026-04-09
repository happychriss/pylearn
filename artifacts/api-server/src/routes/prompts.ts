import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, filesTable, promptTemplatesTable } from "@workspace/db";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.get("/admin/prompts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const prompts = await db
    .select()
    .from(promptTemplatesTable)
    .orderBy(promptTemplatesTable.createdAt);
  res.json(prompts);
});

router.post("/admin/prompts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const { title, content } = req.body;
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [prompt] = await db
    .insert(promptTemplatesTable)
    .values({
      title: title.trim(),
      content: typeof content === "string" ? content : "",
      createdByAdminId: req.user!.id,
    })
    .returning();
  res.status(201).json(prompt);
});

router.delete("/admin/prompts/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/prompts/:id/assign", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { studentId } = req.body;
  if (isNaN(id) || !studentId || typeof studentId !== "string") {
    res.status(400).json({ error: "id and studentId are required" });
    return;
  }
  const [prompt] = await db
    .select()
    .from(promptTemplatesTable)
    .where(eq(promptTemplatesTable.id, id));
  if (!prompt) {
    res.status(404).json({ error: "Prompt not found" });
    return;
  }
  const [student] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, studentId));
  if (!student || student.role !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  // Store as a .prompt file so the sidebar can differentiate
  const [file] = await db
    .insert(filesTable)
    .values({
      userId: studentId,
      filename: `${prompt.title}.prompt`,
      content: prompt.content,
    })
    .returning();
  res.status(201).json(file);
});

export default router;
