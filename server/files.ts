import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FileInfo } from "../src/types.ts";
import { HttpError } from "./errors.ts";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const PHOTO_PATH = path.join(PUBLIC_DIR, "reference", "profile.png");

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;

const toFileInfo = (name: string, stat: { size: number; mtimeMs: number }): FileInfo => ({
  name,
  size: stat.size,
  mtime: Math.round(stat.mtimeMs),
});

/**
 * 保留已有文件中未改动行的原始换行符。参考简历存在 CRLF/LF 混用，
 * 这样即使直接保存未编辑的内容，也不会产生整文件行尾 diff。
 */
function applyOriginalLineEndings(
  previous: string | null,
  content: string,
): string {
  const normalized = content.replace(/\r\n?/g, "\n");
  if (previous === null) return normalized;

  const previousLines = previous.split(/\r\n|\n|\r/);
  const previousEols = previous.match(/\r\n|\n|\r/g) ?? [];
  const crlfCount = previousEols.filter((eol) => eol === "\r\n").length;
  const lfCount = previousEols.filter((eol) => eol === "\n").length;
  const dominant = crlfCount >= lfCount ? "\r\n" : "\n";

  const nextLines = normalized.split("\n");
  let output = "";
  for (let i = 0; i < nextLines.length; i += 1) {
    output += nextLines[i];
    if (i === nextLines.length - 1) break;
    const originalEol =
      previousLines[i] === nextLines[i] ? previousEols[i] : undefined;
    output += originalEol ?? dominant;
  }
  return output;
}

const isMarkdownName = (name: string): boolean =>
  /\.md$/i.test(name) && !/^readme\.md$/i.test(name) && !name.startsWith(".");

export async function listMarkdownFiles(): Promise<FileInfo[]> {
  const entries = await fs.readdir(PROJECT_ROOT, { withFileTypes: true });
  const files: FileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isMarkdownName(entry.name)) continue;
    try {
      const stat = await fs.stat(path.join(PROJECT_ROOT, entry.name));
      files.push(toFileInfo(entry.name, stat));
    } catch {
      // 单个文件不可读时跳过，不影响其他简历。
    }
  }

  return files.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
}

export async function findReferencePdf(): Promise<string | null> {
  const entries = await fs.readdir(PROJECT_ROOT, { withFileTypes: true });
  const pdfs: FileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.pdf$/i.test(entry.name)) continue;
    try {
      const stat = await fs.stat(path.join(PROJECT_ROOT, entry.name));
      pdfs.push(toFileInfo(entry.name, stat));
    } catch {
      // ignore
    }
  }
  pdfs.sort((a, b) => b.mtime - a.mtime);
  return pdfs[0]?.name ?? null;
}

export async function photoExists(): Promise<boolean> {
  try {
    const stat = await fs.stat(PHOTO_PATH);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function photoDataUri(): Promise<string | null> {
  try {
    const buffer = await fs.readFile(PHOTO_PATH);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function validateName(name: unknown): string {
  if (typeof name !== "string") {
    throw new HttpError(400, "INVALID_NAME", "文件名必须是字符串。");
  }
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) {
    throw new HttpError(400, "INVALID_NAME", "文件名为空或过长。");
  }
  if (trimmed !== path.basename(trimmed)) {
    throw new HttpError(403, "INVALID_NAME", "文件名不能包含路径。");
  }
  if (/[\\/:*?"<>|]/.test(trimmed) || trimmed.startsWith(".")) {
    throw new HttpError(400, "INVALID_NAME", "文件名包含非法字符。");
  }
  if (!/\.md$/i.test(trimmed)) {
    throw new HttpError(400, "INVALID_NAME", "只能保存为 .md 文件。");
  }
  if (/^readme\.md$/i.test(trimmed)) {
    throw new HttpError(403, "RESERVED_NAME", "README.md 不是简历文件，请使用其他名称。");
  }

  const resolved = path.join(PROJECT_ROOT, trimmed);
  if (path.dirname(resolved) !== PROJECT_ROOT) {
    throw new HttpError(403, "INVALID_NAME", "目标路径必须位于工作区根目录。");
  }
  return trimmed;
}

export async function readMarkdownFile(
  name: unknown,
): Promise<{ file: FileInfo; content: string }> {
  const safeName = validateName(name);
  const resolved = path.join(PROJECT_ROOT, safeName);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new HttpError(404, "NOT_FOUND", `找不到文件：${safeName}`);
  }
  if (!stat.isFile()) {
    throw new HttpError(400, "NOT_A_FILE", `${safeName} 不是普通文件。`);
  }
  if (stat.size > MAX_MARKDOWN_BYTES) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Markdown 文件超过 5 MB。");
  }

  const raw = await fs.readFile(resolved, "utf8");
  const content = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return { file: toFileInfo(safeName, stat), content };
}

export async function saveMarkdownFile(
  name: unknown,
  content: unknown,
  overwrite: unknown,
): Promise<FileInfo> {
  const safeName = validateName(name);
  if (typeof content !== "string") {
    throw new HttpError(400, "INVALID_CONTENT", "文件内容必须是字符串。");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_MARKDOWN_BYTES) {
    throw new HttpError(413, "CONTENT_TOO_LARGE", "内容超过 5 MB，未保存。");
  }

  const resolved = path.join(PROJECT_ROOT, safeName);
  let exists = false;
  let previousRaw: string | null = null;
  try {
    const stat = await fs.stat(resolved);
    exists = true;
    if (!stat.isFile()) {
      throw new HttpError(400, "NOT_A_FILE", `${safeName} 不是普通文件。`);
    }
    try {
      previousRaw = await fs.readFile(resolved, "utf8");
    } catch {
      previousRaw = null;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    exists = false;
  }

  if (exists && overwrite !== true) {
    throw new HttpError(409, "EXISTS", `文件已存在：${safeName}`);
  }

  const output = applyOriginalLineEndings(previousRaw, content);
  const tempPath = path.join(
    PROJECT_ROOT,
    `.${safeName}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await fs.writeFile(tempPath, output, "utf8");
    await fs.rename(tempPath, resolved);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore
    }
    throw new HttpError(
      500,
      "WRITE_FAILED",
      `写入 ${safeName} 失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }

  const stat = await fs.stat(resolved);
  return toFileInfo(safeName, stat);
}

export async function resolveReferencePdf(): Promise<string | null> {
  const name = await findReferencePdf();
  return name ? path.join(PROJECT_ROOT, name) : null;
}
