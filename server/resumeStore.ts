import type { RowDataPacket } from "mysql2/promise";
import { NEW_RESUME_TEMPLATE } from "../src/resume/template.ts";
import { getPool } from "./db.ts";
import { HttpError } from "./errors.ts";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export interface StoredResume {
  content: string;
  updatedAtMs: number;
}

async function readResume(userId: number): Promise<StoredResume | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT content, UNIX_TIMESTAMP(updated_at) * 1000 AS updated_at_ms
       FROM resumes WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  if (rows.length === 0) return null;
  return {
    content: String(rows[0].content),
    updatedAtMs: Number(rows[0].updated_at_ms),
  };
}

export async function getResume(userId: number): Promise<StoredResume> {
  const existing = await readResume(userId);
  if (existing) return existing;

  const pool = getPool();
  await pool.execute(
    "INSERT IGNORE INTO resumes (user_id, content) VALUES (?, ?)",
    [userId, NEW_RESUME_TEMPLATE],
  );
  const created = await readResume(userId);
  if (!created) {
    throw new HttpError(500, "RESUME_READ_FAILED", "无法读取简历数据。");
  }
  return created;
}

export async function saveResume(
  userId: number,
  content: unknown,
): Promise<StoredResume> {
  if (typeof content !== "string") {
    throw new HttpError(400, "INVALID_CONTENT", "简历内容必须是字符串。");
  }
  const normalized = content.replace(/\r\n?/g, "\n");
  if (Buffer.byteLength(normalized, "utf8") > MAX_RESUME_BYTES) {
    throw new HttpError(413, "CONTENT_TOO_LARGE", "简历内容超过 5 MB，未保存。");
  }

  const pool = getPool();
  await pool.execute(
    `INSERT INTO resumes (user_id, content, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       content = VALUES(content),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [userId, normalized],
  );

  const saved = await readResume(userId);
  if (!saved) {
    throw new HttpError(500, "RESUME_SAVE_FAILED", "简历保存后无法读取。");
  }
  return saved;
}
