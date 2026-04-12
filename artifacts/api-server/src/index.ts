import { createServer } from "http";
import app from "./app";
import { setupWebSocket } from "./lib/websocket";

// Fail fast if critical environment variables are missing.
// Google OAuth credentials are only required when not in local-auth dev mode.
const missingVars = [
  ...["PORT", "DATABASE_URL"].filter((v) => !process.env[v]),
  ...(process.env.LOCAL_AUTH !== "true"
    ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter((v) => !process.env[v])
    : []),
];
if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(", ")}`);
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocket(server);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
