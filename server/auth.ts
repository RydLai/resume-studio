import "dotenv/config";
import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { NEW_RESUME_TEMPLATE } from "../src/resume/template.ts";
import { getPool } from "./db.ts";
import { HttpError } from "./errors.ts";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");

const SESSION_COOKIE = "resume_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SECRET =
  (process.env.APP_SESSION_SECRET ?? "").trim() ||
  randomBytes(32).toString("hex");

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const scryptAsync = promisify(scrypt);

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
}

interface UserWithPassword extends AuthUser {
  passwordHash: string;
}

interface SeedUser {
  username: string;
  password: string;
}

interface LoginAttempt {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

function hashToken(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "base64url");
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function parseSeedUsers(raw: string | undefined): SeedUser[] {
  if (!raw?.trim()) return [];
  const users: SeedUser[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const username = entry.slice(0, separator).trim();
    const password = entry.slice(separator + 1);
    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username)) {
      console.warn(`[auth] 跳过非法用户名：${username || "(空)"}`);
      continue;
    }
    if (!password) {
      console.warn(`[auth] 跳过没有密码的用户：${username}`);
      continue;
    }
    if (seen.has(username.toLowerCase())) continue;
    seen.add(username.toLowerCase());
    users.push({ username, password });
  }
  return users;
}

const seedUsers = parseSeedUsers(process.env.SEED_USERS);
const seedResumeUser = (process.env.SEED_RESUME_USER ?? "").trim();
const seedResumeFile = (process.env.SEED_RESUME_FILE ?? "").trim();

function resolveSeedFile(file: string): string {
  const resolved = path.resolve(PROJECT_ROOT, file);
  if (path.dirname(resolved) !== PROJECT_ROOT || !/\.md$/i.test(resolved)) {
    throw new Error("SEED_RESUME_FILE 必须是项目根目录下的 .md 文件。");
  }
  return resolved;
}

async function readSeedResume(): Promise<string> {
  if (!seedResumeFile) return NEW_RESUME_TEMPLATE;
  try {
    const resolved = resolveSeedFile(seedResumeFile);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error("不是普通文件");
    if (stat.size > MAX_RESUME_BYTES) throw new Error("文件超过 5 MB");
    const raw = await fs.readFile(resolved, "utf8");
    return raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  } catch (error) {
    console.warn(
      `[auth] 初始化简历文件失败，改用空白框架：${seedResumeFile}`,
      error,
    );
    return NEW_RESUME_TEMPLATE;
  }
}

export async function initAuthData(): Promise<void> {
  if (seedUsers.length === 0) {
    console.warn(
      "[auth] 未配置 SEED_USERS，当前没有可登录用户。请在 .env 中配置默认用户。",
    );
    return;
  }

  const pool = getPool();
  for (const seed of seedUsers) {
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id, username, display_name FROM users WHERE username = ? LIMIT 1",
      [seed.username],
    );

    let userId: number;
    if (existing.length === 0) {
      const passwordHash = await hashPassword(seed.password);
      const [result] = await pool.execute(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
        [seed.username, passwordHash, seed.username],
      );
      userId = Number((result as { insertId: number }).insertId);
      console.log(`[auth] 已创建默认用户：${seed.username}`);
    } else {
      userId = Number(existing[0].id);
    }

    const [resume] = await pool.query<RowDataPacket[]>(
      "SELECT user_id FROM resumes WHERE user_id = ? LIMIT 1",
      [userId],
    );
    if (resume.length === 0) {
      const content =
        seedResumeUser && seedResumeUser === seed.username
          ? await readSeedResume()
          : NEW_RESUME_TEMPLATE;
      await pool.execute(
        "INSERT INTO resumes (user_id, content) VALUES (?, ?)",
        [userId, content],
      );
      console.log(`[auth] 已为 ${seed.username} 初始化简历`);
    }
  }
}

export async function findUserByUsername(
  username: string,
): Promise<UserWithPassword | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, username, display_name, password_hash FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
  };
}

export async function verifyUserPassword(
  user: UserWithPassword,
  password: string,
): Promise<boolean> {
  return verifyPassword(password, user.passwordHash);
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, username, display_name FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    username: String(rows[0].username),
    displayName: String(rows[0].display_name),
  };
}

export function publicUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

function issueToken(userId: number): string {
  const expiresAt = String(Date.now() + SESSION_MS);
  return `${userId}.${expiresAt}.${hashToken(`${userId}.${expiresAt}`)}`;
}

function readSessionToken(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdText, expiresAt, signature] = parts;
  if (!/^\d+$/.test(userIdText) || !/^\d+$/.test(expiresAt)) return null;
  if (Number(expiresAt) < Date.now()) return null;
  if (!safeEqual(signature, hashToken(`${userIdText}.${expiresAt}`))) {
    return null;
  }
  const userId = Number(userIdText);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function isSecureRequest(request: Request): boolean {
  if (request.secure) return true;
  const forwarded = request.headers["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value ?? "").split(",")[0].trim() === "https";
}

export function setSession(
  request: Request,
  response: Response,
  userId: number,
): void {
  response.cookie(SESSION_COOKIE, issueToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_MS,
  });
}

export function clearSession(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function getSessionUser(
  request: Request,
): Promise<AuthUser | null> {
  const userId = readSessionToken(readCookie(request, SESSION_COOKIE));
  if (!userId) return null;
  return getUserById(userId);
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      throw new HttpError(401, "AUTH_REQUIRED", "请先登录。");
    }
    response.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function assertLoginAttemptAllowed(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return;
  if (now >= record.resetAt) {
    loginAttempts.delete(key);
    return;
  }
  if (record.count >= MAX_ATTEMPTS) {
    throw new HttpError(
      429,
      "TOO_MANY_ATTEMPTS",
      "登录尝试次数过多，请 10 分钟后再试。",
    );
  }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now >= record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  record.count += 1;
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

export function defaultSeedUsernames(): string[] {
  return seedUsers.map((user) => user.username);
}
