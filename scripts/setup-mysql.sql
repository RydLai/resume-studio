-- Run once as a MySQL administrator (for example root).
-- Replace the password before executing. Never commit the real password.
--
-- Security:
--   * Do not expose MySQL 3306 to the public internet.
--   * Do not use a passwordless root account for the application.
--   * Prefer restricting 'resume_app'@'%' to the application server's IP.
--   * The application creates its own tables inside this database.

CREATE DATABASE IF NOT EXISTS resume_studio
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'resume_app'@'%'
  IDENTIFIED BY 'replace-with-a-strong-database-password';

GRANT ALL PRIVILEGES ON resume_studio.* TO 'resume_app'@'%';
FLUSH PRIVILEGES;
