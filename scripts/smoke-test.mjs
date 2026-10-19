import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const executablePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fixtureMd = "__smoke-source.md";
const tempMd = "__smoke-test.md";
const tempPdf = "smoke-style.pdf";
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const API_URL = process.env.API_URL || "http://127.0.0.1:3001";

// 4×4 红色 PNG，用于验证上传、压缩与 PDF data URI 嵌入。
const TEST_PHOTO_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGPcp6HBAANMcBZeDgA2VgEWdGetXwAAAABJRU5ErkJggg==";

const FIXTURE_MD = `# 测试姓名

求职方向 · 示例岗位
138-0000-0000  |  test@example.com

## 教育背景

::: start
**2020.09 — 2024.06**

:::
**示例大学**

:::
**计算机科学 · 本科**

::: end
示例荣誉

## 工作经历

::: start
**2024.07 — 至今**

:::
**示例公司** · 示例城市

:::
**后端开发**

::: end

**工作内容**：用于验证简历排版与 PDF 导出的示例段落。

- **职责一**：描述负责的模块与方案。
- **职责二**：描述协作方式与工程实践。
- **职责三**：描述可量化的结果。

## 项目经验

::: start
**2023.01 — 2023.06**

:::
**示例项目**

:::
**开发者**

::: end

**项目内容**：用于验证项目段落的排版。

- **项目工作**：实现核心功能。
- **项目成果**：交付可用版本。

## 专业技能

- **示例方向**：熟悉常见工程实践。
- **示例工具**：\`TypeScript\` \`Node.js\` \`Redis\`
`;

const TEST_MODULE = `

## 验证模块

**链接**：[示例链接](https://example.com/resume?q=1&x=2)

**邮箱**：[test@example.com](mailto:test@example.com)

**特殊字符**：<script>window.__xss=1</script> & < > " '

- 长字符串：${"A".repeat(300)}
`;

const hash = async (value) =>
  createHash("sha256").update(value).digest("hex");

await fs.rm(tempMd, { force: true });
await fs.rm(tempPdf, { force: true });
await fs.writeFile(fixtureMd, FIXTURE_MD, "utf8");
const fixtureHash = await hash(await fs.readFile(fixtureMd));

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const dialogs = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("dialog", async (dialog) => {
  dialogs.push(dialog.message());
  await dialog.dismiss();
});

const waitForLayout = async () => {
  await page.waitForFunction(
    () =>
      document.querySelector(".preview-pages-badge")?.textContent !== "排版中",
    { timeout: 15000 },
  );
  await page.waitForSelector(".r-page");
  await page.waitForTimeout(500);
};

const pageCount = async () => page.locator(".r-page").count();

try {
  console.log("1. 初始加载通用测试简历");
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await waitForLayout();
  assert.equal(await page.locator(".file-name").textContent(), fixtureMd);
  assert.equal(
    (await page.locator(".preview-pages .r-name").textContent())?.trim(),
    "测试姓名",
  );
  assert.ok((await pageCount()) >= 1);

  console.log("1b. 同页增量编辑实时刷新");
  const noteLine = page
    .locator(".cm-line")
    .filter({ hasText: "示例荣誉" })
    .first();
  await noteLine.click();
  await page.keyboard.press("End");
  await page.keyboard.type("X");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".preview-pages")
        ?.textContent?.includes("示例荣誉X") === true,
    { timeout: 3000 },
  );
  await page.keyboard.press("Backspace");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".preview-pages")
        ?.textContent?.includes("示例荣誉X") === false,
    { timeout: 3000 },
  );

  console.log("1c. 当前行选区高亮可见");
  await noteLine.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const selectionFacts = await page.evaluate(() => {
    const selection = document.querySelector(".cm-selectionBackground");
    const activeLine = document.querySelector(".cm-activeLine");
    return {
      count: document.querySelectorAll(".cm-selectionBackground").length,
      background: selection
        ? window.getComputedStyle(selection).backgroundColor
        : null,
      activeLineBackground: activeLine
        ? window.getComputedStyle(activeLine).backgroundColor
        : null,
    };
  });
  assert.ok(selectionFacts.count > 0);
  assert.ok(
    selectionFacts.background &&
      selectionFacts.background !== "rgba(0, 0, 0, 0)",
  );
  assert.equal(selectionFacts.activeLineBackground, "rgba(0, 0, 0, 0)");

  console.log("2. 另存为临时文件");
  await page.getByRole("button", { name: "另存为", exact: true }).click();
  await page.locator(".modal input.text-input").fill(tempMd);
  await page.locator(".modal-foot .button.primary").click();
  await page.waitForSelector(".modal", { state: "detached" });
  await page.waitForFunction(
    (name) => document.querySelector(".file-name")?.textContent === name,
    tempMd,
  );
  assert.ok(await fs.stat(tempMd), "临时 Markdown 未创建");

  console.log("3. 编辑 Markdown 并检查实时预览");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(FIXTURE_MD + TEST_MODULE);
  await waitForLayout();
  const previewText = (await page.locator(".preview-pages").textContent()) ?? "";
  assert.match(previewText, /验证模块/);
  assert.match(previewText, /示例链接/);
  assert.match(previewText, /特殊字符/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);

  console.log("4. 保存到磁盘并刷新验证");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(900);
  const saved = await fs.readFile(tempMd, "utf8");
  assert.match(saved, /验证模块/);
  assert.match(saved, /草稿标记|长字符串/);

  await page.reload({ waitUntil: "networkidle" });
  await waitForLayout();
  assert.equal(await page.locator(".file-name").textContent(), tempMd);
  assert.match(
    (await page.locator(".preview-pages").textContent()) ?? "",
    /验证模块/,
  );

  console.log("4b. 未保存草稿在刷新后恢复");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\n草稿标记XYZ");
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  await waitForLayout();
  assert.match(
    (await page.locator(".preview-pages").textContent()) ?? "",
    /草稿标记XYZ/,
  );
  assert.match(
    (await page.locator(".save-indicator").textContent()) ?? "",
    /未保存的修改/,
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(900);
  assert.match(await fs.readFile(tempMd, "utf8"), /草稿标记XYZ/);

  console.log("5. 修改样式并检查预览");
  await page.getByRole("button", { name: "样式", exact: true }).click();
  await page.waitForSelector(".style-panel");
  const ranges = page.locator(".style-panel .range-row input[type=number]");
  await ranges.nth(0).fill("10.5");
  await ranges.nth(1).fill("1.7");
  await ranges.nth(2).fill("14");
  await ranges.nth(3).fill("12");
  const margins = page.locator(".style-panel .margin-field input");
  await margins.nth(0).fill("8");
  await margins.nth(1).fill("12");
  await margins.nth(2).fill("14");
  await margins.nth(3).fill("14");
  await page.locator(".style-panel .color-text").fill("#123456");
  const toggles = page.locator(".style-panel .toggle-row input");
  await toggles.nth(0).uncheck();
  await toggles.nth(1).uncheck();
  await waitForLayout();
  await page.waitForTimeout(500);

  const readStyleFacts = () =>
    page.evaluate(() => {
      const pageEl = document.querySelector(".r-page");
      const style = getComputedStyle(pageEl);
      const tab = document.querySelector(".r-section-tab-text");
      return {
        fontSize: style.fontSize,
        paddingLeft: style.paddingLeft,
        tabBackground: tab ? getComputedStyle(tab).backgroundColor : null,
        rules: document.querySelectorAll(".r-section-rule").length,
        photos: document.querySelectorAll(".r-photo").length,
      };
    });

  let styleFacts = await readStyleFacts();
  console.log("   style:", JSON.stringify(styleFacts));
  assert.equal(styleFacts.fontSize, "14px");
  assert.match(styleFacts.paddingLeft, /^52\.9/);
  assert.equal(styleFacts.tabBackground, "rgb(18, 52, 86)");
  assert.equal(styleFacts.rules, 0);
  assert.equal(styleFacts.photos, 0);
  assert.ok((await pageCount()) >= 1);

  console.log("5b. 刷新后样式配置仍然生效");
  await page.reload({ waitUntil: "networkidle" });
  await waitForLayout();
  styleFacts = await readStyleFacts();
  assert.equal(styleFacts.fontSize, "14px");
  assert.match(styleFacts.paddingLeft, /^52\.9/);
  assert.equal(styleFacts.rules, 0);
  assert.equal(styleFacts.photos, 0);

  console.log("5c. 上传并拖动自定义照片");
  await page.getByRole("button", { name: "样式", exact: true }).click();
  await page.waitForSelector(".style-panel");
  await page.locator(".style-panel input[type=file]").setInputFiles({
    name: "smoke-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(TEST_PHOTO_PNG, "base64"),
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".photo-thumb")
        ?.getAttribute("src")
        ?.startsWith("data:image/jpeg") === true,
    { timeout: 10000 },
  );
  const photoFields = page.locator(".style-panel .photo-grid input");
  const photoBeforeDrag = await photoFields.evaluateAll((inputs) =>
    inputs.map((input) => input.value),
  );
  const photo = page.locator(".preview-pages .r-photo");
  await photo.scrollIntoViewIfNeeded();
  const photoBox = await photo.boundingBox();
  assert.ok(photoBox);
  await page.mouse.move(
    photoBox.x + photoBox.width / 2,
    photoBox.y + photoBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    photoBox.x + photoBox.width / 2 - 60,
    photoBox.y + photoBox.height / 2 + 70,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  const photoAfterDrag = await photoFields.evaluateAll((inputs) =>
    inputs.map((input) => input.value),
  );
  assert.ok(
    Number(photoAfterDrag[2]) < Number(photoBeforeDrag[2]),
    "photo x did not move left",
  );
  assert.ok(
    Number(photoAfterDrag[3]) > Number(photoBeforeDrag[3]),
    "photo y did not move down",
  );
  const storedPhoto = await page.evaluate(() => {
    const raw = localStorage.getItem("resume-studio:style:v1");
    const value = raw ? JSON.parse(raw) : null;
    return {
      dataUrl: value?.photoDataUrl,
      x: value?.photoX,
      y: value?.photoY,
    };
  });
  assert.ok(storedPhoto.dataUrl?.startsWith("data:image/jpeg"));
  assert.ok(Number(storedPhoto.x) < Number(photoBeforeDrag[2]));
  await page.getByRole("button", { name: "样式", exact: true }).click();
  await page.waitForSelector(".style-panel", { state: "detached" });

  console.log("6. 在自定义样式下导出 PDF");
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  const download = await downloadPromise;
  await download.saveAs(tempPdf);
  assert.equal(await download.failure(), null);
  assert.equal(download.suggestedFilename(), "resume.pdf");
  assert.ok((await fs.stat(tempPdf)).size > 10_000);

  console.log("7. 检查所有页面无内部溢出");
  const overflowInfo = await page.evaluate(() =>
    [...document.querySelectorAll(".r-page-inner")].map((inner) => ({
      clientHeight: inner.clientHeight,
      scrollHeight: inner.scrollHeight,
    })),
  );
  for (const entry of overflowInfo) {
    assert.ok(
      entry.scrollHeight <= entry.clientHeight + 1,
      `page overflow ${entry.scrollHeight} > ${entry.clientHeight}`,
    );
  }
  assert.equal(
    (await page.locator(".preview-banner.is-error").count()) === 0,
    true,
  );

  console.log("8. 恢复默认样式并测试单页内容");
  await page.getByRole("button", { name: "样式", exact: true }).click();
  await page.waitForSelector(".style-panel");
  await page.getByRole("button", { name: "恢复默认样式" }).click();
  await waitForLayout();
  assert.ok((await page.locator(".preview-pages .r-section-rule").count()) > 0);
  assert.ok((await page.locator(".preview-pages .r-photo").count()) <= 1);

  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(`# 测试姓名

求职方向 · 示例岗位
138-0000-0000 | test@example.com

## 教育背景

::: start
**2020.09 — 2024.06**

:::
**示例大学**

:::
**计算机科学 · 本科**

::: end
示例荣誉

## 专业技能

- **示例方向**：熟悉常见工程实践。
- **示例工具**：熟悉常用开发工具。
`);
  await waitForLayout();
  assert.equal(await pageCount(), 1);

  console.log("8b. 从电脑打开本地 Markdown 文件");
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.waitForSelector(".modal");
  await page.locator(".modal input[type=file]").setInputFiles({
    name: "local-test.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# 本地测试\n\n后端开发 · 本地文件\nlocal@example.com\n\n## 教育背景\n\n- 仅用于验证本地文件读取。\n",
      "utf8",
    ),
  });
  await page.waitForSelector(".modal", { state: "detached" });
  await waitForLayout();
  assert.equal(await page.locator(".file-chip-label").textContent(), "本地");
  assert.equal(await page.locator(".file-name").textContent(), "local-test.md");
  assert.equal(
    (await page.locator(".preview-pages .r-name").textContent())?.trim(),
    "本地测试",
  );

  console.log("8c. 新建空白简历");
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.waitForSelector(".modal");
  await page.getByRole("button", { name: "新建空白简历" }).click();
  await page.waitForSelector(".modal", { state: "detached" });
  await waitForLayout();
  assert.equal(await page.locator(".file-chip-label").textContent(), "新建");
  assert.equal(await page.locator(".file-name").textContent(), "未命名简历.md");
  assert.equal(
    (await page.locator(".preview-pages .r-name").textContent())?.trim(),
    "姓名",
  );
  assert.match(
    (await page.locator(".preview-pages").textContent()) ?? "",
    /教育背景[\s\S]*工作经历[\s\S]*项目经验[\s\S]*专业技能/,
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForSelector(".modal");
  assert.equal(await page.locator(".modal-title").textContent(), "另存为 Markdown");
  assert.equal(
    await page.locator(".modal input.text-input").inputValue(),
    "未命名简历.md",
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal", { state: "detached" });

  console.log("9. 通过 API 验证文件校验与错误反馈");
  const api = async (path, options) => {
    const response = await fetch(`${API_URL}${path}`, options);
    return response.status;
  };
  assert.equal(
    await api("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "../evil.md", content: "x", overwrite: true }),
    }),
    403,
  );
  assert.equal(
    await api("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "README.md", content: "x", overwrite: true }),
    }),
    403,
  );
  assert.equal(
    await api("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x.pdf", content: "x", overwrite: true }),
    }),
    400,
  );
  assert.equal(
    await api("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tempMd, content: "x", overwrite: false }),
    }),
    409,
  );
  assert.equal(
    await api("/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagesHtml: "", style: {}, title: "x" }),
    }),
    400,
  );

  console.log("10. 检查页面错误、XSS 与文件保护");
  assert.deepEqual(dialogs, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await hash(await fs.readFile(fixtureMd)), fixtureHash);
  console.log("   generic fixture unchanged");
  console.log("SMOKE TEST PASSED");
} finally {
  await browser.close();
  await fs.rm(tempMd, { force: true });
  await fs.rm(fixtureMd, { force: true });
}
