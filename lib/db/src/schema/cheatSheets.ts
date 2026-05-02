import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cheatSheetsTable = pgTable("cheat_sheets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  icon: text("icon").notNull().default("📄"),
  content: text("content").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCheatSheetSchema = createInsertSchema(cheatSheetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCheatSheet = z.infer<typeof insertCheatSheetSchema>;
export type CheatSheet = typeof cheatSheetsTable.$inferSelect;
