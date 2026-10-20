import assert from "node:assert/strict";
import "dotenv/config";
import { chromium } from "playwright-core";

const appUrl = process.env.APP_URL || "http://localhost:5173";
const apiUrl = process.env.API_URL || "http://127.0.0.1:3001";

const firstSeed = (process.env.SEED_USERS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)[0];
const separator = firstSeed?.indexOf(":") ?? -1;
const username = separator > 0 ? firstSeed.slice(0, separator) : "";
const password = separator > 0 ? firstSeed.slice(separator + 1) : "";
if (!username || !password) {
  throw new Error(
    "未找到 SEED_USERS。请先创建 .env，并确保其中包含默认登录用户。",
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
});
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !message.text().includes("401 (Unauthorized)")
  ) {
    consoleErrors.push(message.text());
  }
});

let original = "";

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".login-page");
  assert.equal(await page.locator(".r-page").count(), 0);
  assert.match(await page.locator(".login-note").textContent(), /不开放注册/);
  console.log("1. 未登录只显示登录页，没有简历内容和注册入口");

  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".form-error");
  console.log("2. 错误密码被拒绝");

  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".app-shell");
  await page.waitForSelector(".r-page");
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole("button", { name: /导出 PDF/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "打开", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "另存为", exact: true }).count(), 0);
  console.log("3. 登录成功，只显示当前账号的简历编辑界面");

  const cookies = await context.cookies(appUrl);
  assert.ok(
    cookies.find(
      (cookie) => cookie.name === "resume_session" && cookie.httpOnly,
    ),
  );
  console.log("4. 登录 Cookie 为 HttpOnly");

  original = await page.evaluate(async () => {
    const response = await fetch("/api/resume");
    if (!response.ok) throw new Error(`GET /api/resume: ${response.status}`);
    return (await response.json()).content;
  });

  const marker = `smoke-${Date.now()}`;
  const line = page.locator(".cm-line").first();
  await line.click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${marker}`);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(400);

  const saved = await page.evaluate(async () => {
    const response = await fetch("/api/resume");
    return response.json();
  });
  assert.ok(saved.content.includes(marker));
  assert.equal(saved.content.length, original.length + marker.length + 1);
  console.log("5. 保存后 MySQL 中内容包含新修改");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".r-page");
  await page.waitForTimeout(400);
  const reloaded = await page.evaluate(async () => {
    const response = await fetch("/api/resume");
    return (await response.json()).content;
  });
  assert.ok(reloaded.includes(marker));
  console.log("6. 刷新后仍保持登录并读取已保存内容");

  await page.evaluate(async (content) => {
    const response = await fetch("/api/resume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error(`restore failed: ${response.status}`);
  }, original);

  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForSelector(".login-page");
  console.log("7. 退出登录后回到登录页");

  const fresh = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const freshPage = await fresh.newPage();
  await freshPage.goto(appUrl, { waitUntil: "networkidle" });
  await freshPage.waitForSelector(".login-page");
  const unauthorized = await freshPage.evaluate(async () => {
    const response = await fetch("/api/resume");
    return response.status;
  });
  assert.equal(unauthorized, 401);
  await fresh.close();
  console.log("8. 未登录访问简历 API 返回 401");

  assert.deepEqual(consoleErrors, []);
  console.log("SMOKE TEST PASSED");
} finally {
  if (original) {
    try {
      await page.evaluate(async (content) => {
        await fetch("/api/resume", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
      }, original);
    } catch {
      // 页面可能已退出登录；保留数据库原样。
    }
  }
  await browser.close();
}
