import { pgTable, serial, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const promptTemplatesTable = pgTable("prompt_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdByAdminId: varchar("created_by_admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PromptTemplate = typeof promptTemplatesTable.$inferSelect;
