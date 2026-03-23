import OpenAI from "openai";

// OpenAI client is optional — only created if env vars are set.
// The base URL defaults to OpenAI's standard API if not overridden.
export const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
    })
  : null;
