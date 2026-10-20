import "dotenv/config";
import mysql, { type Pool } from "mysql2/promise";

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const databaseName = (process.env.MYSQL_DATABASE ?? "resume_studio").trim();
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error("MYSQL_DATABASE 只能包含字母、数字和下划线。");
}

const config: DatabaseConfig = {
  host: (process.env.MYSQL_HOST ?? "127.0.0.1").trim(),
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: (process.env.MYSQL_USER ?? "root").trim(),
  password: process.env.MYSQL_PASSWORD ?? "",
  database: databaseName,
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) throw new Error("数据库尚未初始化。");
  return pool;
}

export async function initDatabase(): Promise<void> {
  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10_000,
    charset: "utf8mb4",
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(64) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        user_id INT UNSIGNED NOT NULL,
        content LONGTEXT NOT NULL,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id),
        CONSTRAINT fk_resumes_user
          FOREIGN KEY (user_id) REFERENCES users (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ER_BAD_DB_ERROR") {
      throw new Error(
        `MySQL 数据库 ${databaseName} 不存在。请先创建数据库并授权应用账号：CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      );
    }
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export function databaseInfo(): {
  host: string;
  port: number;
  database: string;
  user: string;
} {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  };
}
