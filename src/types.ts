import type { StyleConfig } from "./resume/style";

export interface FileInfo {
  name: string;
  size: number;
  mtime: number;
}

export interface BootstrapPayload {
  files: FileInfo[];
  currentFile: FileInfo | null;
  content: string;
  pdfReference: string | null;
  photoAvailable: boolean;
}

export interface CurrentFile {
  name: string;
  /** workspace:<name>、local:<name> 或 new:<timestamp>，用于区分草稿 */
  id: string;
  source: "workspace" | "local" | "new";
  size?: number;
  mtime?: number;
}

export interface SaveResult {
  file: FileInfo;
  mtime: number;
}

export interface ExportPayload {
  pagesHtml: string;
  style: StyleConfig;
  title: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: "info" | "success" | "error" | "warning";
}
