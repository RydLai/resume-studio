import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BootstrapPayload } from "../src/types.ts";
import { HttpError } from "./errors.ts";
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

app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "resume-studio" });
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
