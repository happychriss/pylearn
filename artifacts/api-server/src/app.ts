import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";

const app: Express = express();

// Allow only the configured deployment origin (APP_URL in prod, localhost in dev)
const allowedOrigin = process.env.APP_URL ?? "http://localhost:8080";
app.use(cors({ credentials: true, origin: allowedOrigin }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

// In production, serve the built SPA frontend
if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "..", "..", "pylearn", "dist", "public");
  // Versioned assets (content-hashed filenames) can be cached indefinitely.
  // Everything else (including index.html) must not be cached so browsers
  // always fetch the latest entry point after a deploy.
  app.use(express.static(staticDir, {
    setHeaders(res, filePath) {
      if (filePath.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }));
  // SPA fallback: serve index.html for any non-API route
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// Central error handler — Express 5 forwards async route rejections here. Without
// it an unhandled error in a route leaks a stack trace / hangs the request.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[unhandled]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
