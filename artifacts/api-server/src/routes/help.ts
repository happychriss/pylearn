import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, helpRequestsTable, usersTable } from "@workspace/db";
import {
  ListHelpRequestsResponse,
  CreateHelpRequestBody,
  DismissHelpRequestParams,
  DismissHelpRequestResponse,
} from "@workspace/api-zod";

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

router.get("/help-requests", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const requests = await db
    .select({
      id: helpRequestsTable.id,
      userId: helpRequestsTable.userId,
      userName: usersTable.firstName,
      message: helpRequestsTable.message,
      status: helpRequestsTable.status,
      createdAt: helpRequestsTable.createdAt,
    })
    .from(helpRequestsTable)
    .leftJoin(usersTable, eq(helpRequestsTable.userId, usersTable.id))
    .where(eq(helpRequestsTable.status, "active"));

  res.json(ListHelpRequestsResponse.parse(requests));
});

router.post("/help-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateHelpRequestBody.safeParse(req.body);
  const message = parsed.success && parsed.data.message ? parsed.data.message : "I need help";

  const [request] = await db
    .insert(helpRequestsTable)
    .values({
      userId: req.user.id,
      message,
    })
    .returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));

  const response = {
    ...request,
    userName: user?.firstName || null,
  };

  res.status(201).json(response);
});

router.post("/help-requests/:id/dismiss", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const params = DismissHelpRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [updated] = await db
    .update(helpRequestsTable)
    .set({ status: "dismissed" })
    .where(eq(helpRequestsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Help request not found" });
    return;
  }

  res.json(DismissHelpRequestResponse.parse({ ...updated, userName: null }));
});

export default router;
