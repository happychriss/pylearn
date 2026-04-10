import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiConfigTable = pgTable("ai_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("openai"),
  mode: text("mode").notNull().default("suggestion"),
  apiKey: text("api_key"),
  suggestionSystemPrompt: text("suggestion_system_prompt").notNull().default(
    "You are a helpful Python tutor for children aged 11-14. Give hints and short explanations — guide the student toward the solution rather than writing it for them. Keep code simple and beginner-friendly. Do not produce code diffs or apply changes directly."
  ),
  agentSystemPrompt: text("agent_system_prompt").notNull().default(
    "You are a Python coding assistant for young learners (11-14). Only use standard Python and, as a first choice, the exact commands from the PyLearn library. You can suggest larger code changes. Keep explanations simple and age-appropriate. Never silently change code — always explain what you did."
  ),
  offSystemPrompt: text("off_system_prompt").notNull().default(
    "AI assistance is currently disabled by the teacher."
  ),
  chatSystemPrompt: text("chat_system_prompt").notNull().default(
    "You are a friendly AI assistant for children aged 11-14 who are learning about AI. Keep your answers simple, age-appropriate, and safe. Never provide inappropriate content. Encourage curiosity and critical thinking about AI. If asked something inappropriate, gently redirect the conversation. Do not write code — this mode is for learning about AI, not coding."
  ),
});

export const insertAiConfigSchema = createInsertSchema(aiConfigTable).omit({ id: true });
export type InsertAiConfig = z.infer<typeof insertAiConfigSchema>;
export type AiConfig = typeof aiConfigTable.$inferSelect;
