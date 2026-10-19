import { DEFAULT_STYLE, normalizeStyle, type StyleConfig } from "./resume/style";

const STYLE_KEY = "resume-studio:style:v1";
const DRAFT_PREFIX = "resume-studio:draft:v1:";
const SPLIT_KEY = "resume-studio:split:v1";

export interface Draft {
  content: string;
  savedContent: string;
  updatedAt: number;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage 不可用或被写满时，静默降级为仅内存状态。
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadStyle(): StyleConfig {
  const raw = safeGet(STYLE_KEY);
  if (!raw) return DEFAULT_STYLE;
  try {
    return normalizeStyle(JSON.parse(raw));
  } catch {
    return DEFAULT_STYLE;
  }
}

export function saveStyle(style: StyleConfig): void {
  safeSet(STYLE_KEY, JSON.stringify(style));
}

export function loadDraft(fileId: string): Draft | null {
  const raw = safeGet(DRAFT_PREFIX + fileId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.content !== "string") return null;
    return {
      content: parsed.content,
      savedContent:
        typeof parsed.savedContent === "string" ? parsed.savedContent : "",
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveDraft(fileId: string, draft: Draft): void {
  safeSet(DRAFT_PREFIX + fileId, JSON.stringify(draft));
}

export function removeDraft(fileId: string): void {
  safeRemove(DRAFT_PREFIX + fileId);
}

export function loadSplit(): number {
  const raw = safeGet(SPLIT_KEY);
  const value = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(value)) return 44;
  return Math.min(68, Math.max(30, value));
}

export function saveSplit(value: number): void {
  safeSet(SPLIT_KEY, String(value));
}
