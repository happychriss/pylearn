import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { ExecutePythonBody, ExecutePythonResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const SAFE_ENV: Record<string, string> = {
  PYTHONDONTWRITEBYTECODE: "1",
  PATH: "/usr/bin:/bin",
  HOME: "/tmp",
  LANG: "en_US.UTF-8",
};

router.post("/execute", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = ExecutePythonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { code } = parsed.data;

  try {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const proc = spawn("python3", ["-c", code], {
        timeout: 10000,
        env: SAFE_ENV,
        cwd: "/tmp",
      });

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > 50000) {
          proc.kill();
          killed = true;
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (exitCode) => {
        if (killed) {
          stderr += "\n[Output truncated - too large]";
        }
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });

      proc.on("error", (err) => {
        resolve({ stdout: "", stderr: err.message, exitCode: 1 });
      });
    });

    res.json(ExecutePythonResponse.parse(result));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Execution failed";
    res.json(ExecutePythonResponse.parse({
      stdout: "",
      stderr: message,
      exitCode: 1,
    }));
  }
});

export default router;
