import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BootstrapPayload } from "../src/types.ts";
import { HttpError } from "./errors.ts";
import {
  assertExportAttemptAllowed,
  clearExportFailures,
  exportPasswordConfigured,
  exportSessionDurationMs,
  hasExportSession,
  recordExportFailure,
  setExportSession,
  verifyExportPassword,
} from "./exportAuth.ts";
import {
  PHOTO_PATH,
  PROJECT_ROOT,
  findReferencePdf,
  listMarkdownFiles,
  photoExists,
  readMarkdownFile,
  saveMarkdownFile,
} from "./files.ts";
import {
  closePdfBrowser,
  generateResumePdf,
} from "./pdf.ts";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const appAccessUser = (process.env.APP_ACCESS_USER ?? "resume").trim() || "resume";
const appAccessPassword = (process.env.APP_ACCESS_PASSWORD ?? "").trim();

const authDigest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

const constantTimeEqual = (left: string, right: string): boolean =>
  timingSafeEqual(authDigest(left), authDigest(right));

const basicChallenge = (response: Response): void => {
  response.setHeader(
    "WWW-Authenticate",
    'Basic realm="Resume Studio", charset="UTF-8"',
  );
  response.status(401).send("Authentication required");
};

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);

// 可选的整站访问保护。未设置 APP_ACCESS_PASSWORD 时保持原行为。
if (appAccessPassword) {
  app.use((request, response, next) => {
    if (request.path === "/api/health") {
      next();
      return;
    }
    const header = request.headers.authorization ?? "";
    if (!/^Basic\s+/i.test(header)) {
      basicChallenge(response);
      return;
    }
    let user = "";
    let password = "";
    try {
      const decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString(
        "utf8",
      );
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        user = decoded.slice(0, separator);
        password = decoded.slice(separator + 1);
      }
    } catch {
      // 非法 Base64 按认证失败处理。
    }
    if (
      !constantTimeEqual(user, appAccessUser) ||
      !constantTimeEqual(password, appAccessPassword)
    ) {
      basicChallenge(response);
      return;
    }
    next();
  });
}

app.use(express.json({ limit: "10mb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "resume-studio" });
});

app.get("/api/export-auth", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({
    authorized: hasExportSession(request),
    configured: exportPasswordConfigured(),
  });
});

app.post("/api/export-auth", (request, response, next) => {
  try {
    if (!exportPasswordConfigured()) {
      throw new HttpError(
        503,
        "EXPORT_PASSWORD_NOT_CONFIGURED",
        "服务器未配置 PDF 导出密码。",
      );
    }
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    assertExportAttemptAllowed(ip);
    const body = request.body as { password?: unknown };
    if (!verifyExportPassword(body?.password)) {
      recordExportFailure(ip);
      throw new HttpError(
        401,
        "INVALID_EXPORT_PASSWORD",
        "密码不正确，请重试。",
      );
    }
    clearExportFailures(ip);
    setExportSession(request, response);
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: true, expiresInMs: exportSessionDurationMs() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", async (_request, response, next) => {
  try {
    const files = await listMarkdownFiles();
    const currentFile = files[0] ?? null;
    const content = currentFile
      ? (await readMarkdownFile(currentFile.name)).content
      : "";
    const pdfReference = await findReferencePdf();
    const payload: BootstrapPayload = {
      files,
      currentFile,
      content,
      pdfReference,
      photoAvailable: await photoExists(),
    };
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/files", async (_request, response, next) => {
  try {
    response.json({ files: await listMarkdownFiles() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/file", async (request, response, next) => {
  try {
    const result = await readMarkdownFile(request.query.name);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/file", async (request, response, next) => {
  try {
    const body = request.body as {
      name?: unknown;
      content?: unknown;
      overwrite?: unknown;
    };
    const file = await saveMarkdownFile(
      body?.name,
      body?.content,
      body?.overwrite,
    );
    response.json({ file, mtime: file.mtime });
  } catch (error) {
    next(error);
  }
});

app.get("/api/photo", (_request, response, next) => {
  try {
    if (!existsSync(PHOTO_PATH)) {
      throw new HttpError(404, "NO_PHOTO", "参考证件照不存在。");
    }
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.type("png");
    response.sendFile(PHOTO_PATH);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reference-pdf", async (_request, response, next) => {
  try {
    const name = await findReferencePdf();
    if (!name) {
      throw new HttpError(404, "NO_REFERENCE", "工作区中未找到参考 PDF。");
    }
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    response.type("pdf");
    response.sendFile(path.join(PROJECT_ROOT, name));
  } catch (error) {
    next(error);
  }
});

app.post("/api/export-pdf", async (request, response, next) => {
  try {
    if (!exportPasswordConfigured()) {
      throw new HttpError(
        503,
        "EXPORT_PASSWORD_NOT_CONFIGURED",
        "服务器未配置 PDF 导出密码，导出功能已关闭。",
      );
    }
    if (!hasExportSession(request)) {
      throw new HttpError(
        401,
        "EXPORT_AUTH_REQUIRED",
        "请输入导出密码后再生成 PDF。",
      );
    }
    const body = request.body as {
      pagesHtml?: unknown;
      style?: unknown;
      title?: unknown;
    };
    if (typeof body?.pagesHtml !== "string") {
      throw new HttpError(400, "INVALID_PAGES", "缺少简历页面数据。");
    }
    const pdf = await generateResumePdf({
      pagesHtml: body.pagesHtml,
      style: body.style,
      title: typeof body.title === "string" ? body.title : "简历",
    });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="resume.pdf"; filename*=UTF-8\'\'resume.pdf',
    );
    response.setHeader("Content-Length", String(pdf.length));
    response.setHeader("Cache-Control", "no-store");
    response.end(pdf);
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
    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    const message =
      error instanceof Error ? error.message : "服务器内部错误，请查看终端日志。";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
    if (status >= 500) {
      console.error("[api] request failed:", error);
    }
    response.status(status).json({
      error: message,
      code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL",
    });
  },
);

if (exportPasswordConfigured()) {
  console.log("[api] PDF export password protection enabled.");
} else {
  console.warn(
    "[api] PDF_EXPORT_PASSWORD is not set; PDF export is disabled.",
  );
}
if (appAccessPassword) {
  console.log("[api] Site-wide Basic Auth enabled.");
}

const server = app.listen(port, host, () => {
  console.log(`[api] Resume Studio API listening on http://${host}:${port}`);
});

const shutdown = async (signal: string) => {
  console.log(`[api] received ${signal}, shutting down…`);
  server.close();
  await closePdfBrowser();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandled rejection:", reason);
});
