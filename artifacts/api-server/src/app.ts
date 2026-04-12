import express, { type Express } from "express";
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
  app.use(express.static(staticDir));
  // SPA fallback: serve index.html for any non-API route
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
