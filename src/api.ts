import type {
  BootstrapPayload,
  ExportPayload,
  FileInfo,
  SaveResult,
} from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response): Promise<ApiError> {
  let message = `请求失败（HTTP ${response.status}）`;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      error?: string;
      code?: string;
    };
    if (payload.error) message = payload.error;
    code = payload.code;
  } catch {
    // 保持默认错误信息
  }
  return new ApiError(message, response.status, code);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export function getBootstrap(): Promise<BootstrapPayload> {
  return getJson<BootstrapPayload>("/api/bootstrap");
}

export function listFiles(): Promise<{ files: FileInfo[] }> {
  return getJson<{ files: FileInfo[] }>("/api/files");
}

export function readWorkspaceFile(name: string): Promise<{ file: FileInfo; content: string }> {
  return getJson<{ file: FileInfo; content: string }>(
    `/api/file?name=${encodeURIComponent(name)}`,
  );
}

export async function saveWorkspaceFile(payload: {
  name: string;
  content: string;
  overwrite: boolean;
}): Promise<SaveResult> {
  const response = await fetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as SaveResult;
}

export async function exportPdf(payload: ExportPayload): Promise<Blob> {
  const response = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await readError(response);
  const blob = await response.blob();
  if (!blob.size) throw new Error("PDF 生成结果为空。");
  return blob;
}

export interface ExportAuthStatus {
  authorized: boolean;
  configured: boolean;
}

export function getExportAuthStatus(): Promise<ExportAuthStatus> {
  return getJson<ExportAuthStatus>("/api/export-auth");
}

export async function unlockExport(password: string): Promise<void> {
  const response = await fetch("/api/export-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw await readError(response);
}

export function photoUrl(): string {
  return "/api/photo";
}
