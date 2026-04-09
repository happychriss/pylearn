import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiConfigTable = pgTable("ai_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("openai"),
  mode: text("mode").notNull().default("suggestion"),
  apiKey: text("api_key"),
  suggestionSystemPrompt: text("suggestion_system_prompt").notNull().default(
    "You are a helpful Python tutor for children aged 11-14. When the student asks for code changes, respond with a clear explanation and a JSON code suggestion block. Format suggestions as: ```suggestion\n{\"file\": \"filename.py\", \"oldCode\": \"original lines\", \"newCode\": \"replacement lines\", \"explanation\": \"what changed and why\"}\n``` Keep code simple and beginner-friendly. Prefer hints over full solutions."
  ),
  agentSystemPrompt: text("agent_system_prompt").notNull().default(
    "You are a Python coding assistant for young learners (11-14). You can suggest larger code changes. Always show what you want to change using the suggestion format: ```suggestion\n{\"file\": \"filename.py\", \"oldCode\": \"original lines\", \"newCode\": \"replacement lines\", \"explanation\": \"what changed and why\"}\n``` Keep explanations simple. Never silently change code."
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
