import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import "dotenv/config";
import { chromium } from "playwright-core";

const exportPassword = (process.env.PDF_EXPORT_PASSWORD ?? "").trim();
if (!exportPassword) {
  throw new Error(
    "未设置 PDF_EXPORT_PASSWORD。请先把 .env.example 复制为 .env 并填写导出密码。",
  );
}

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !message.text().includes("401 (Unauthorized)")
  ) {
    errors.push(message.text());
  }
});

const firstPdf = "export-auth-test-1.pdf";
const secondPdf = "export-auth-test-2.pdf";

try {
  await page.goto(process.env.APP_URL || "http://localhost:5173", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".r-page");
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await page.waitForSelector(".modal");
  assert.equal(await page.locator(".modal-title").textContent(), "导出密码");
  console.log("1. 未验证时弹出密码框");

  await page.locator('.modal input[type="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "验证并导出" }).click();
  await page.waitForSelector(".form-error");
  console.log("2. 错误密码被拒绝：", await page.locator(".form-error").textContent());

  await page.locator('.modal input[type="password"]').fill(exportPassword);
  const firstDownload = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "验证并导出" }).click();
  const first = await firstDownload;
  await first.saveAs(firstPdf);
  assert.equal(await first.failure(), null);
  await page.waitForSelector(".modal", { state: "detached" });
  console.log("3. 正确密码导出成功：", (await fs.stat(firstPdf)).size, "bytes");

  const cookies = await context.cookies(
    process.env.APP_URL || "http://localhost:5173",
  );
  const session = cookies.find(
    (cookie) => cookie.name === "resume_export_session",
  );
  assert.ok(session?.httpOnly);
  console.log("4. 会话 Cookie 为 HttpOnly");

  const secondDownload = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  const second = await secondDownload;
  await second.saveAs(secondPdf);
  assert.equal(await page.locator(".modal").count(), 0);
  console.log("5. 同一会话再次导出无需输入密码");

  const freshContext = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    acceptDownloads: true,
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(process.env.APP_URL || "http://localhost:5173", {
    waitUntil: "networkidle",
  });
  await freshPage.waitForSelector(".r-page");
  await freshPage.waitForTimeout(500);
  await freshPage.getByRole("button", { name: /导出 PDF/ }).click();
  await freshPage.waitForSelector(".modal");
  assert.equal(await freshPage.locator(".modal-title").textContent(), "导出密码");
  console.log("6. 新会话重新要求输入密码");
  await freshContext.close();

  assert.deepEqual(errors, []);
  console.log("EXPORT AUTH TEST PASSED");
} finally {
  await browser.close();
  await fs.rm(firstPdf, { force: true });
  await fs.rm(secondPdf, { force: true });
}
