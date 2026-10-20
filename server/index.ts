import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLoginAttemptAllowed,
  clearLoginFailures,
  clearSession,
  defaultSeedUsernames,
  findUserByUsername,
  getSessionUser,
  initAuthData,
  publicUser,
  recordLoginFailure,
  requireAuth,
  setSession,
  verifyUserPassword,
  type AuthUser,
} from "./auth.ts";
import { closeDatabase, databaseInfo, initDatabase } from "./db.ts";
import { HttpError } from "./errors.ts";
import { getResume, saveResume } from "./resumeStore.ts";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");
const PHOTO_PATH = path.join(PROJECT_ROOT, "public", "reference", "profile.png");

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

async function photoExists(): Promise<boolean> {
  try {
    return (await fs.stat(PHOTO_PATH)).isFile();
  } catch {
    return false;
  }
}

function authUser(response: Response): AuthUser {
  return response.locals.user as AuthUser;
}

async function main(): Promise<void> {
  await initDatabase();
  await initAuthData();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
  app.use(express.json({ limit: "10mb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "resume-studio" });
  });

  app.get("/api/auth/me", async (request, response, next) => {
    try {
      const user = await getSessionUser(request);
      response.setHeader("Cache-Control", "no-store");
      response.json({
        authenticated: Boolean(user),
        user: user ? publicUser(user) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (request, response, next) => {
    try {
      const body = request.body as { username?: unknown; password?: unknown };
      const username =
        typeof body?.username === "string" ? body.username.trim() : "";
      const password =
        typeof body?.password === "string" ? body.password : "";
      if (!username || !password) {
        throw new HttpError(400, "INVALID_CREDENTIALS", "请输入用户名和密码。");
      }

      const ip = request.ip || request.socket.remoteAddress || "unknown";
      const attemptKey = `${ip}|${username.toLowerCase()}`;
      assertLoginAttemptAllowed(attemptKey);

      const user = await findUserByUsername(username);
      const valid =
        user !== null && (await verifyUserPassword(user, password));
      if (!user || !valid) {
        recordLoginFailure(attemptKey);
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "用户名或密码不正确。",
        );
      }

      clearLoginFailures(attemptKey);
      setSession(request, response, user.id);
      response.setHeader("Cache-Control", "no-store");
      response.json({ authenticated: true, user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (_request, response) => {
    clearSession(response);
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: true });
  });

  app.get("/api/resume", requireAuth, async (request, response, next) => {
    try {
      const user = authUser(response);
      const resume = await getResume(user.id);
      response.setHeader("Cache-Control", "no-store");
      response.json({
        content: resume.content,
        updatedAtMs: resume.updatedAtMs,
        photoAvailable: await photoExists(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/resume", requireAuth, async (request, response, next) => {
    try {
      const user = authUser(response);
      const body = request.body as { content?: unknown };
      const saved = await saveResume(user.id, body?.content);
      response.setHeader("Cache-Control", "no-store");
      response.json({ updatedAtMs: saved.updatedAtMs });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/photo", requireAuth, async (_request, response, next) => {
    try {
      if (!(await photoExists())) {
        throw new HttpError(404, "NO_PHOTO", "默认证件照不存在。");
      }
      response.setHeader("Cache-Control", "private, max-age=300");
      response.type("png");
      response.sendFile(PHOTO_PATH);
    } catch (error) {
      next(error);
    }
  });

  const distIndex = path.join(PROJECT_ROOT, "dist", "index.html");
  if (existsSync(distIndex)) {
    app.use(express.static(path.join(PROJECT_ROOT, "dist")));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(distIndex);
    });
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "接口不存在。", code: "NOT_FOUND" });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (response.headersSent) return;
      const httpError = error instanceof HttpError ? error : null;
      const status = httpError?.status ?? 500;
      const message =
        httpError?.message ??
        (error instanceof Error ? error.message : "服务器内部错误。");
      if (status >= 500) {
        console.error("[api] request failed:", error);
      }
      response.status(status).json({
        error: message,
        code:
          httpError?.code ??
          (status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL"),
      });
    },
  );

  const info = databaseInfo();
  const seedUsernames = defaultSeedUsernames();
  const server = app.listen(port, host, () => {
    console.log(
      `[api] Resume Studio listening on http://${host}:${port} (MySQL ${info.host}:${info.port}/${info.database})`,
    );
    if (seedUsernames.length > 0) {
      console.log(`[api] 可登录用户：${seedUsernames.join(", ")}`);
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] received ${signal}, shutting down…`);
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
  console.error("[api] startup failed:", error);
  process.exit(1);
});
