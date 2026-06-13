import { Router, type IRouter } from "express";
import { jsonrepair } from "jsonrepair";
import { eq, and, gt, sql } from "drizzle-orm";
import { db, filesTable, aiConfigTable, usersTable, studentAccountsTable } from "@workspace/db";
import { AiChatBody, AcceptSuggestionBody, AcceptSuggestionResponse } from "@workspace/api-zod";
import { getOpenAiClient } from "@workspace/integrations-openai-ai-server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { PYLEARN_LIBRARY_REFERENCE } from "../lib/pylearn-ref";
import { applyChanges, type RawChange } from "../lib/suggestion-apply";

const router: IRouter = Router();

// Model IDs are centralized so they are easy to review/update in one place when a
// provider rotates or deprecates a snapshot (a hardcoded, deprecated id silently
// 500s mid-lesson). Keep these current.
const MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash",
} as const;

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

When suggesting a code change, end your response with exactly this block:

---SUGGESTION---
{
  "explanation": "brief explanation of what changed",
  "new_content": "the COMPLETE updated program from the first line to the last"
}
---END_SUGGESTION---

Content rules:
1. new_content is the ENTIRE file after your change — every line of the program, not just the parts you touched. The student's editor is replaced with exactly this text, so anything you leave out is deleted.
2. Change ONLY what the student asked for. Keep every other line byte-for-byte identical to the current file — same code, comments, blank lines, and indentation.
3. If you use a pylearn function that the file does not import yet, add the import in new_content:
   - For functions used with the module prefix (e.g. pylearn.show): add \`import pylearn\` at the top if not present.
   - For adventure functions called directly (scene, say, ask, show_sprite, move_sprite, show_text, clear_text): add the names to a \`from pylearn import ...\` line — extend the existing line if there is one instead of adding a duplicate.
   - For \`time.sleep\` or any other stdlib module: add the import if missing.

CRITICAL JSON rules — the block is machine-parsed. Any violation breaks the apply button for the student:
4. The content between ---SUGGESTION--- and ---END_SUGGESTION--- must be valid JSON. No exceptions.
5. No comments inside the JSON — not // and not /* */. Comments are not valid JSON.
6. No trailing commas after the last item in an object.
7. All strings must use double quotes. Escape internal double quotes as \\".
   Example — Python line  print("Hello")  becomes in JSON  "print(\"Hello\")".
8. Newlines inside new_content must be written as \\n, not literal line breaks.

Output rules:
9. Do NOT show the modified code in a \`\`\`python block as well — the suggestion block is the only place for code.
10. Do NOT wrap the suggestion block in triple backticks. Use the literal ---SUGGESTION--- and ---END_SUGGESTION--- markers exactly as shown.
11. Emit at most ONE suggestion block per response.
12. For explanations with no code change, omit the block entirely.`;

interface RawSuggestionPayload {
  explanation: string;
  new_content?: string;    // preferred format: the complete updated file
  newContent?: string;     // camelCase alias the AI sometimes emits
  changes?: RawChange[];   // legacy find/replace format — kept as a safety net
  file?: string;
}

// What we send to the client (unchanged — full computed newContent)
interface SuggestionPayload {
  file: string;
  newContent: string;
  explanation: string;
}

/** Repair common AI-generated JSON problems using the jsonrepair library.
 *  Handles trailing commas, single quotes, missing brackets, JS string concatenation,
 *  // comments, backtick fences, and many other LLM output quirks. */
function repairJson(str: string): string {
  return jsonrepair(str);
}

/** Parse the AI response and resolve it to a final SuggestionPayload (with computed newContent),
 *  or return an error string, or null if no suggestion was present at all. */
function extractSuggestion(
  fullText: string,
  fileContext: string,
  filename: string,
): { text: string; suggestion: SuggestionPayload | null; error?: string } {
  const tryResolve = (jsonStr: string, cleanText: string) => {
    const raw = JSON.parse(repairJson(jsonStr)) as RawSuggestionPayload;
    if (!raw.explanation) return null;

    // Preferred: the AI returns the complete updated file. No anchor matching, so this
    // can never fail with "could not find" / ambiguous-line errors.
    const fullFile = raw.new_content ?? raw.newContent;
    if (typeof fullFile === "string" && fullFile.trim().length > 0) {
      return {
        suggestion: {
          file: raw.file ?? filename,
          newContent: fullFile,
          explanation: raw.explanation,
        },
        cleanText,
      };
    }

    // Safety net: legacy find/replace format, in case the model emits the old shape.
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

    return null;
  };

  // Primary format: ---SUGGESTION--- ... ---END_SUGGESTION---
  const marker = "---SUGGESTION---";
  const endMarker = "---END_SUGGESTION---";
  const startIdx = fullText.indexOf(marker);
  const endIdx = fullText.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Strip backtick fences the AI sometimes wraps around the JSON despite instructions
    let jsonStr = fullText.slice(startIdx + marker.length, endIdx).trim();
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    const cleanText = fullText.slice(0, startIdx).trim();
    try {
      const resolved = tryResolve(jsonStr, cleanText);
      if (resolved) {
        if ('error' in resolved) {
          console.error('[AI suggestion] applyChanges failed:', resolved.error);
          console.error('[AI suggestion] raw JSON:\n', jsonStr);
          return { text: resolved.cleanText, suggestion: null, error: resolved.error };
        }
        return { text: resolved.cleanText, suggestion: resolved.suggestion! };
      }
    } catch (e) {
      console.error('[AI suggestion] JSON parse failed:', e instanceof Error ? e.message : e);
      console.error('[AI suggestion] raw JSON:\n', jsonStr);
      return { text: cleanText, suggestion: null, error: 'Suggestion JSON could not be parsed' };
    }
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
  res: import("express").Response,
  shouldStop: () => boolean = () => false
): Promise<string> {
  let fullContent = "";

  if (config.provider === "openai") {
    const client = getOpenAiClient(config.apiKey);
    const stream = await client.chat.completions.create({
      model: MODELS.openai,
      max_completion_tokens: 8192,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      if (shouldStop()) break;
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
      model: MODELS.anthropic,
      max_tokens: 8192,
      system: systemPrompt,
      messages: nonSystemMessages,
    });

    for await (const event of stream) {
      if (shouldStop()) break;
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
      model: MODELS.gemini,
      config: { systemInstruction: systemPrompt },
      contents: nonSystemMessages,
    });

    for await (const chunk of response) {
      if (shouldStop()) break;
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

  // Fail fast if the provider key is missing — BEFORE charging a credit, so a
  // misconfiguration never costs the student a credit for a non-answer.
  if (config.provider !== "openai" && !resolveApiKey(config)) {
    res.status(503).json({ error: "AI is not configured correctly. Please tell your teacher." });
    return;
  }

  // Credit check + decrement — students only, atomic so concurrent requests can't
  // both read the same balance and double-spend (or grant a free turn).
  let chargedAccountId: string | null = null;
  {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (currentUser?.role === "student") {
      const decremented = await db
        .update(studentAccountsTable)
        .set({ aiCredits: sql`${studentAccountsTable.aiCredits} - 1` })
        .where(and(eq(studentAccountsTable.id, req.user.id), gt(studentAccountsTable.aiCredits, 0)))
        .returning({ id: studentAccountsTable.id });
      if (decremented.length === 0) {
        res.status(403).json({ error: "No credits remaining. Contact your teacher for more credits." });
        return;
      }
      chargedAccountId = req.user.id;
    }
  }

  // Refund the credit if the request fails before producing any answer.
  const refundCredit = async () => {
    if (!chargedAccountId) return;
    const id = chargedAccountId;
    chargedAccountId = null;
    try {
      await db
        .update(studentAccountsTable)
        .set({ aiCredits: sql`${studentAccountsTable.aiCredits} + 1` })
        .where(eq(studentAccountsTable.id, id));
    } catch (e) {
      console.error("[ai] credit refund failed:", e);
    }
  };

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

  // Inject the current file AFTER history so the AI always sees the freshest state last.
  // Placing it before history caused the AI to use old mental models from previous turns
  // when generating old_text, leading to "Could not find" errors on multi-turn edits.
  if (parsed.data.fileContext) {
    messages.push({
      role: "system",
      content: `Current file (${parsed.data.filename || "untitled.py"}):\n\`\`\`python\n${parsed.data.fileContext}\n\`\`\``,
    });
  }

  messages.push({ role: "user", content: parsed.data.message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Stop pulling from the provider if the student closes the tab mid-answer —
  // otherwise we keep consuming (and paying for) tokens with nowhere to send them.
  let clientGone = false;
  req.on("close", () => { clientGone = true; });
  const shouldStop = () => clientGone || res.writableEnded;

  try {
    const fullContent = await streamFromProvider(
      { provider: config.provider, apiKey: config.apiKey, mode: config.mode },
      systemPrompt,
      messages,
      res,
      shouldStop
    );

    // Suggestion extraction only applies to agent mode.
    // In suggestion mode the AI returns plain code blocks for copy/paste — no diff widget.
    if (config.mode === "agent") {
      const fileContext = parsed.data.fileContext ?? '';
      const filename = parsed.data.filename ?? 'file.py';
      const { text, suggestion, error } = extractSuggestion(fullContent, fileContext, filename);
      if (suggestion) {
        res.write(`data: ${JSON.stringify({ type: "suggestion", suggestion, cleanText: text })}\n\n`);
      } else if (error) {
        res.write(`data: ${JSON.stringify({ type: "suggestion", suggestion: null, cleanText: `${text}\n\n⚠ Could not apply automatically: ${error}` })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: unknown) {
    // The student got no usable answer — give the credit back.
    await refundCredit();
    if (!res.writableEnded) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.write(`data: ${JSON.stringify({ type: "text", content: `Error: ${message}` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    }
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
