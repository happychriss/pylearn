import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, cheatSheetsTable } from "@workspace/db";

const router: IRouter = Router();

// Active sheets for students (polls every 30s on client)
router.get("/cheatsheets/active", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const sheets = await db.select().from(cheatSheetsTable)
    .where(eq(cheatSheetsTable.isActive, true))
    .orderBy(asc(cheatSheetsTable.sortOrder), asc(cheatSheetsTable.id));
  res.json(sheets);
});

// Single sheet — used by the view page
router.get("/cheatsheets/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  const [sheet] = await db.select().from(cheatSheetsTable).where(eq(cheatSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  res.json(sheet);
});

export default router;
