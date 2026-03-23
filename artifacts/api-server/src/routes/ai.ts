import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, filesTable, aiConfigTable, usersTable } from "@workspace/db";
import { AiChatBody, AcceptSuggestionBody, AcceptSuggestionResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

async function getAiConfig() {
  let [config] = await db.select().from(aiConfigTable);
  if (!config) {
    [config] = await db.insert(aiConfigTable).values({}).returning();
  }
  return config;
}

function resolveApiKey(config: { provider: string; apiKey: string | null }): string | null {
  if (config.provider === "openai") return null;
  const key = config.apiKey;
  if (!key) return null;
  if (key.startsWith("ENV:")) {
    const envName = key.slice(4);
    return process.env[envName] || null;
  }
  return key;
}

const SUGGESTION_INSTRUCTION = `\n\nWhen you want to suggest a code change, you MUST end your response with a JSON block in exactly this format:
---SUGGESTION---
{"file": "filename.py", "lineStart": 1, "lineEnd": 10, "newContent": "replacement lines here", "explanation": "brief explanation of what changed"}
---END_SUGGESTION---
lineStart and lineEnd indicate the 1-based line range being replaced. newContent contains ONLY the replacement lines for that range (not the entire file). The server will splice newContent into the file, replacing lines lineStart through lineEnd inclusive.
Only include this block when you have a concrete code change to propose. For explanations or questions, respond normally without the block.`;

interface SuggestionPayload {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  newContent: string;
  explanation: string;
}

function extractSuggestion(fullText: string): { text: string; suggestion: SuggestionPayload | null } {
  const marker = "---SUGGESTION---";
  const endMarker = "---END_SUGGESTION---";
  const startIdx = fullText.indexOf(marker);
  const endIdx = fullText.indexOf(endMarker);
  
  if (startIdx === -1 || endIdx === -1) {
    return { text: fullText, suggestion: null };
  }
  
  const jsonStr = fullText.slice(startIdx + marker.length, endIdx).trim();
  const cleanText = fullText.slice(0, startIdx).trim();
  
  try {
    const parsed = JSON.parse(jsonStr) as SuggestionPayload;
    if (parsed.file && parsed.newContent && parsed.explanation) {
      return { text: cleanText, suggestion: parsed };
    }
  } catch {
    // Failed to parse suggestion JSON
  }
  
  return { text: fullText, suggestion: null };
}

function applySuggestionPatch(
  originalContent: string,
  suggestion: { lineStart?: number; lineEnd?: number; newContent: string }
): string {
  if (!suggestion.lineStart || !suggestion.lineEnd) {
    return suggestion.newContent;
  }
  
  const lines = originalContent.split('\n');
  const before = lines.slice(0, suggestion.lineStart - 1);
  const after = lines.slice(suggestion.lineEnd);
  const newLines = suggestion.newContent.split('\n');
  
  return [...before, ...newLines, ...after].join('\n');
}

async function streamFromProvider(
  config: { provider: string; apiKey: string | null; mode: string },
  systemPrompt: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  res: import("express").Response
): Promise<string> {
  let fullContent = "";

  if (config.provider === "openai") {
    if (!openai) {
      throw new Error("OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY environment variable.");
    }
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
      }
    }
  } else if (config.provider === "anthropic") {
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      const errMsg = "Error: Anthropic API key not configured. Set it in admin settings using ENV:VARIABLE_NAME format.";
      res.write(`data: ${JSON.stringify({ type: "text", content: errMsg })}\n\n`);
      return errMsg;
    }
    
    const anthropic = new Anthropic({ apiKey });
    const nonSystemMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: nonSystemMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const content = event.delta.text;
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
      }
    }
  } else if (config.provider === "gemini") {
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      const errMsg = "Error: Gemini API key not configured. Set it in admin settings using ENV:VARIABLE_NAME format.";
      res.write(`data: ${JSON.stringify({ type: "text", content: errMsg })}\n\n`);
      return errMsg;
    }
    
    const genAI = new GoogleGenAI({ apiKey });
    const nonSystemMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    const response = await genAI.models.generateContentStream({
      model: "gemini-2.0-flash",
      config: { systemInstruction: systemPrompt },
      contents: nonSystemMessages,
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        fullContent += text;
        res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
      }
    }
  }

  return fullContent;
}

router.post("/ai/chat", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const config = await getAiConfig();

  if (config.mode === "off") {
    res.status(403).json({ error: "AI assistance is currently disabled by the teacher." });
    return;
  }

  let systemPrompt = config.mode === "suggestion"
    ? config.suggestionSystemPrompt
    : config.agentSystemPrompt;

  if (config.mode === "suggestion" || config.mode === "agent") {
    systemPrompt += SUGGESTION_INSTRUCTION;
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  if (parsed.data.fileContext) {
    messages.push({
      role: "system",
      content: `Current file (${parsed.data.filename || "untitled.py"}):\n\`\`\`python\n${parsed.data.fileContext}\n\`\`\``,
    });
  }

  if (parsed.data.conversationHistory) {
    for (const msg of parsed.data.conversationHistory) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  messages.push({ role: "user", content: parsed.data.message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const fullContent = await streamFromProvider(
      { provider: config.provider, apiKey: config.apiKey, mode: config.mode },
      systemPrompt,
      messages,
      res
    );

    const { text, suggestion } = extractSuggestion(fullContent);
    if (suggestion) {
      res.write(`data: ${JSON.stringify({ type: "suggestion", suggestion, cleanText: text })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ type: "text", content: `Error: ${message}` })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  }
});

router.post("/ai/suggestion/accept", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = AcceptSuggestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, parsed.data.fileId));

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  if (file.userId !== req.user.id && currentUser?.role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const finalContent = applySuggestionPatch(file.content || "", {
    lineStart: parsed.data.lineStart ?? undefined,
    lineEnd: parsed.data.lineEnd ?? undefined,
    newContent: parsed.data.newContent,
  });

  const [updated] = await db
    .update(filesTable)
    .set({ content: finalContent })
    .where(eq(filesTable.id, parsed.data.fileId))
    .returning();

  res.json(AcceptSuggestionResponse.parse(updated));
});

router.post("/ai/suggestion/reject", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({ success: true });
});

export default router;
