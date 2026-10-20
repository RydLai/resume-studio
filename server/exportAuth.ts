import "dotenv/config";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { HttpError } from "./errors.ts";

const EXPORT_PASSWORD = (process.env.PDF_EXPORT_PASSWORD ?? "").trim();
const SESSION_SECRET =
  (process.env.EXPORT_SESSION_SECRET ?? "").trim() ||
  randomBytes(32).toString("hex");

const SESSION_COOKIE = "resume_export_session";
const SESSION_MS = 2 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

const safeEqual = (left: string, right: string): boolean =>
  timingSafeEqual(digest(left), digest(right));

const sign = (expiresAt: string): string =>
  createHmac("sha256", SESSION_SECRET)
    .update(expiresAt)
    .digest("base64url");

const issueToken = (): string => {
  const expiresAt = String(Date.now() + SESSION_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
};

const isSecureRequest = (request: Request): boolean => {
  if (request.secure) return true;
  const forwarded = request.headers["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value ?? "").split(",")[0].trim() === "https";
};

const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
};

export function exportPasswordConfigured(): boolean {
  return EXPORT_PASSWORD.length > 0;
}

export function verifyExportPassword(input: unknown): boolean {
  if (!EXPORT_PASSWORD || typeof input !== "string" || !input) return false;
  return safeEqual(input, EXPORT_PASSWORD);
}

export function assertExportAttemptAllowed(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record) return;
  if (now >= record.resetAt) {
    attempts.delete(ip);
    return;
  }
  if (record.count >= MAX_ATTEMPTS) {
    throw new HttpError(
      429,
      "TOO_MANY_ATTEMPTS",
      "密码尝试次数过多，请 10 分钟后再试。",
    );
  }
}

export function recordExportFailure(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now >= record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  record.count += 1;
}

export function clearExportFailures(ip: string): void {
  attempts.delete(ip);
}

export function setExportSession(request: Request, response: Response): void {
  response.cookie(SESSION_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_MS,
  });
}

export function hasExportSession(request: Request): boolean {
  if (!exportPasswordConfigured()) return false;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresAt, signature] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) {
    return false;
  }

  const expected = sign(expiresAt);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function clearExportSession(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function exportSessionDurationMs(): number {
  return SESSION_MS;
}
