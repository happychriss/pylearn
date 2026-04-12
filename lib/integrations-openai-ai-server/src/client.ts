import OpenAI from "openai";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";

// OpenAI client is optional — only created if env vars are set.
// The base URL defaults to OpenAI's standard API if not overridden.
export const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL })
  : null;

/**
 * Returns an OpenAI client, resolving the API key at call time.
 * Priority: global client (set at startup) → ENV:* reference in config → direct apiKey arg → AI_INTEGRATIONS_OPENAI_API_KEY env var.
 * This handles cases where the key is set via admin dashboard or .env.local loaded after startup.
 */
export function getOpenAiClient(configApiKey?: string | null): OpenAI {
  if (openai) return openai;

  // Resolve key from DB-stored ENV reference or direct value
  let resolvedKey: string | null = null;
  if (configApiKey) {
    if (configApiKey.startsWith("ENV:")) {
      resolvedKey = process.env[configApiKey.slice(4)] || null;
    } else {
      resolvedKey = configApiKey;
    }
  }

  // Final fallback: read env var directly (useful when set after process start)
  resolvedKey = resolvedKey || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || null;

  if (!resolvedKey) {
    throw new Error(
      "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY environment variable or configure the API key in the admin settings."
    );
  }

  return new OpenAI({ apiKey: resolvedKey, baseURL });
}
