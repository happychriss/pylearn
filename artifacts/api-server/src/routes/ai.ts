import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, filesTable, aiConfigTable, usersTable, studentAccountsTable } from "@workspace/db";
import { AiChatBody, AcceptSuggestionBody, AcceptSuggestionResponse } from "@workspace/api-zod";
import { getOpenAiClient } from "@workspace/integrations-openai-ai-server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { PYLEARN_LIBRARY_REFERENCE } from "../lib/pylearn-ref";

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

router.get("/ai/student-config", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const config = await getAiConfig();
  res.json({ mode: config.mode });
});

const SUGGESTION_INSTRUCTION = `

---
## Code Change Format (system — do not modify)

When suggesting code changes, end your response with exactly this JSON block:

---SUGGESTION---
{
  "explanation": "brief explanation of what changed",
  "changes": [
    { "old_text": "exact lines from the file", "new_text": "replacement lines" }
  ]
}
---END_SUGGESTION---

Rules:
1. old_text must be copied EXACTLY from the current file — same indentation, spacing, and comments. The system finds your change by locating this exact text.
2. old_text must be unique in the file. If it could match multiple places, include more surrounding lines to make it unambiguous.
3. new_text is the full replacement for old_text. To insert a line, include the anchor line in old_text and the anchor plus the new line in new_text.
4. Use multiple objects in the changes array for edits in separate locations (e.g. a new import AND a new statement).
5. Do NOT show modified code in a \`\`\`python block — the suggestion block is the only place for code.
6. Do NOT wrap the suggestion block in triple backticks. Use the literal ---SUGGESTION--- and ---END_SUGGESTION--- markers exactly as shown.
7. Emit at most ONE suggestion block per response.
8. For explanations with no code change, omit the block entirely.`;

// What the AI returns
interface RawChange {
  old_text: string;
  new_text: string;
}

interface RawSuggestionPayload {
  explanation: string;
  changes?: RawChange[];   // preferred format
  newContent?: string;     // full-file fallback (still accepted)
  file?: string;
}

// What we send to the client (unchanged — full computed newContent)
interface SuggestionPayload {
  file: string;
  newContent: string;
  explanation: string;
}

/** Apply a list of old_text → new_text changes to fileContent.
 *  Each old_text must match exactly once. Returns the patched content or an error. */
function applyChanges(
  fileContent: string,
  changes: RawChange[],
): { ok: true; result: string } | { ok: false; error: string } {
  // Normalise line endings once up front
  let content = fileContent.replace(/\r\n/g, '\n');

  for (const change of changes) {
    const oldText = change.old_text.replace(/\r\n/g, '\n');
    const newText = change.new_text.replace(/\r\n/g, '\n');

    const firstIdx = content.indexOf(oldText);
    if (firstIdx === -1) {
      const preview = oldText.split('\n')[0].trim().slice(0, 60);
      return { ok: false, error: `Could not find: "${preview}"` };
    }

    const secondIdx = content.indexOf(oldText, firstIdx + 1);
    if (secondIdx !== -1) {
      const preview = oldText.split('\n')[0].trim().slice(0, 60);
      return { ok: false, error: `Ambiguous match (appears more than once): "${preview}"` };
    }

    content = content.slice(0, firstIdx) + newText + content.slice(firstIdx + oldText.length);
  }

  return { ok: true, result: content };
}

/** Parse the AI response and resolve it to a final SuggestionPayload (with computed newContent),
 *  or return an error string, or null if no suggestion was present at all. */
function extractSuggestion(
  fullText: string,
  fileContext: string,
  filename: string,
): { text: string; suggestion: SuggestionPayload | null; error?: string } {
  const tryResolve = (jsonStr: string, cleanText: string) => {
    const raw = JSON.parse(jsonStr) as RawSuggestionPayload;
    if (!raw.explanation) return null;

    // Preferred: changes array
    if (Array.isArray(raw.changes) && raw.changes.length > 0) {
      const result = applyChanges(fileContext, raw.changes);
      if (!result.ok) return { error: result.error, cleanText };
      return {
        suggestion: {
          file: raw.file ?? filename,
          newContent: result.result,
          explanation: raw.explanation,
        },
        cleanText,
      };
    }

    // Fallback: full-file newContent
    if (raw.newContent) {
      return {
        suggestion: {
          file: raw.file ?? filename,
          newContent: raw.newContent,
          explanation: raw.explanation,
        },
        cleanText,
      };
    }

    return null;
  };

  // Primary format: ---SUGGESTION--- ... ---END_SUGGESTION---
  const marker = "---SUGGESTION---";
  const endMarker = "---END_SUGGESTION---";
  const startIdx = fullText.indexOf(marker);
  const endIdx = fullText.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonStr = fullText.slice(startIdx + marker.length, endIdx).trim();
    const cleanText = fullText.slice(0, startIdx).trim();
    try {
      const resolved = tryResolve(jsonStr, cleanText);
      if (resolved) {
        if ('error' in resolved) return { text: resolved.cleanText, suggestion: null, error: resolved.error };
        return { text: resolved.cleanText, suggestion: resolved.suggestion! };
      }
    } catch { /* fall through */ }
  }

  // Fallback: ```suggestion fence
  const fenceMatch = fullText.match(/```suggestion\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    const cleanText = fullText.slice(0, fenceMatch.index).trim();
    try {
      const resolved = tryResolve(fenceMatch[1].trim(), cleanText);
      if (resolved) {
        if ('error' in resolved) return { text: resolved.cleanText, suggestion: null, error: resolved.error };
        return { text: resolved.cleanText, suggestion: resolved.suggestion! };
      }
    } catch { /* fall through */ }
  }

  // Last-resort: single ```python block → full-file replacement (no old_text validation possible)
  const pythonFences = [...fullText.matchAll(/```python\s*\n([\s\S]*?)\n```/g)];
  if (pythonFences.length === 1) {
    const newContent = pythonFences[0][1].trim();
    if (newContent.includes('\n')) {
      return {
        text: fullText.slice(0, pythonFences[0].index).trim(),
        suggestion: {
          file: filename,
          newContent,
          explanation: "(Extracted from code block — full file replacement)",
        },
      };
    }
  }

  return { text: fullText, suggestion: null };
}

async function streamFromProvider(
  config: { provider: string; apiKey: string | null; mode: string },
  systemPrompt: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  res: import("express").Response
): Promise<string> {
  let fullContent = "";

  if (config.provider === "openai") {
    const client = getOpenAiClient(config.apiKey);
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
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

  // Credit check for chat mode (students only)
  if (config.mode === "chat") {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (currentUser?.role === "student") {
      const [account] = await db.select().from(studentAccountsTable).where(eq(studentAccountsTable.id, req.user.id));
      if (account && account.aiCredits <= 0) {
        res.status(403).json({ error: "No credits remaining. Contact your teacher for more credits." });
        return;
      }
      // Decrement credit
      if (account) {
        await db
          .update(studentAccountsTable)
          .set({ aiCredits: account.aiCredits - 1 })
          .where(eq(studentAccountsTable.id, req.user.id));
      }
    }
  }

  let systemPrompt: string;
  if (config.mode === "chat") {
    systemPrompt = config.chatSystemPrompt;
  } else if (config.mode === "suggestion") {
    systemPrompt = config.suggestionSystemPrompt;
  } else {
    systemPrompt = config.agentSystemPrompt;
  }

  // Library reference: injected for any code-aware mode
  if (config.mode === "suggestion" || config.mode === "agent") {
    systemPrompt += `\n\n---\n${PYLEARN_LIBRARY_REFERENCE}`;
  }
  // Diff/suggestion format: agent mode only — hardcoded, not editable by the teacher
  if (config.mode === "agent") {
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
      // Strip any leaked suggestion markers from history so they don't confuse the AI
      const content = msg.content
        .replace(/---SUGGESTION---[\s\S]*?---END_SUGGESTION---/g, '')
        .replace(/```suggestion\s*\n[\s\S]*?\n```/g, '')
        .trim();
      messages.push({
        role: msg.role as "user" | "assistant",
        content,
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

    const fileContext = parsed.data.fileContext ?? '';
    const filename = parsed.data.filename ?? 'file.py';
    const { text, suggestion, error } = extractSuggestion(fullContent, fileContext, filename);
    if (suggestion) {
      res.write(`data: ${JSON.stringify({ type: "suggestion", suggestion, cleanText: text })}\n\n`);
    } else if (error) {
      // old_text didn't match — show the explanation but no apply button
      res.write(`data: ${JSON.stringify({ type: "suggestion", suggestion: null, cleanText: `${text}\n\n⚠ Could not apply automatically: ${error}` })}\n\n`);
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

  const [updated] = await db
    .update(filesTable)
    .set({ content: parsed.data.newContent })
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
