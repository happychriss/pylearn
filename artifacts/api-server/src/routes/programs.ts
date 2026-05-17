import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, filesTable, programTemplatesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

router.get("/admin/programs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const programs = await db
    .select()
    .from(programTemplatesTable)
    .orderBy(programTemplatesTable.createdAt);
  res.json(programs);
});

router.post("/admin/programs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const { filename, content } = req.body;
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  const trimmed = filename.trim();
  if (!trimmed.endsWith(".py")) {
    res.status(400).json({ error: "Only .py files are allowed" });
    return;
  }
  const [program] = await db
    .insert(programTemplatesTable)
    .values({
      filename: trimmed,
      content: typeof content === "string" ? content : "",
      createdByAdminId: req.user.id,
    })
    .returning();
  res.status(201).json(program);
});



router.put("/admin/programs/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { content } = req.body;
  if (typeof content !== "string") { res.status(400).json({ error: "content is required" }); return; }
  const [updated] = await db
    .update(programTemplatesTable)
    .set({ content })
    .where(eq(programTemplatesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Program not found" }); return; }
  res.json(updated);
});

router.delete("/admin/programs/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(programTemplatesTable).where(eq(programTemplatesTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/programs/:id/assign", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { studentId } = req.body;
  if (isNaN(id) || !studentId || typeof studentId !== "string") {
    res.status(400).json({ error: "id and studentId are required" });
    return;
  }
  const [program] = await db
    .select()
    .from(programTemplatesTable)
    .where(eq(programTemplatesTable.id, id));
  if (!program) {
    res.status(404).json({ error: "Program not found" });
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
  const [file] = await db
    .insert(filesTable)
    .values({
      userId: studentId,
      filename: program.filename,
      content: program.content,
    })
    .returning();
  res.status(201).json(file);
});

export default router;
