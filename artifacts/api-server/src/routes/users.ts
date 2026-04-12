import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, studentAccountsTable } from "@workspace/db";
import { GetMyProfileResponse, SetMyRoleBody, SetMyRoleResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Include aiCredits for students
  let aiCredits: number | undefined;
  if (user.role === "student") {
    try {
      const [account] = await db.select().from(studentAccountsTable).where(eq(studentAccountsTable.id, user.id));
      if (account) aiCredits = account.aiCredits;
    } catch {
      // Non-fatal — aiCredits just won't be included
    }
  }

  res.json(GetMyProfileResponse.parse({ ...user, aiCredits }));
});

router.patch("/users/me/role", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = SetMyRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const allUsers = await db.select().from(usersTable);
  const hasAdmin = allUsers.some((u) => u.role === "admin");

  if (parsed.data.role === "admin" && hasAdmin && allUsers.find(u => u.id === req.user.id)?.role !== "admin") {
    res.status(403).json({ error: "An admin already exists" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, req.user.id))
    .returning();

  res.json(SetMyRoleResponse.parse(updated));
});

export default router;
