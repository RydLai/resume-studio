import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { chromium, type Browser } from "playwright-core";
import {
  normalizeStyle,
  styleToCssVars,
  type StyleConfig,
} from "../src/resume/style.ts";
import { HttpError } from "./errors.ts";
import { PROJECT_ROOT, photoDataUri } from "./files.ts";

const RESUME_CSS_PATH = path.join(PROJECT_ROOT, "src", "resume", "resume.css");

const MAX_PAGES = 20;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const PRINT_CSS = `
@page { size: A4; margin: 0; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}
*, *::before, *::after {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.r-pages { display: block; }
.r-page {
  margin: 0 !important;
  box-shadow: none !important;
  outline: none !important;
  break-inside: avoid;
  break-after: page;
  page-break-after: always;
}
.r-page:last-child {
  break-after: auto;
  page-break-after: auto;
}
`;

const ALLOWED_TAGS = [
  "section",
  "div",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "del",
  "code",
  "a",
  "br",
  "img",
  "span",
  "hr",
];

function sanitizePages(pagesHtml: string): string {
  return sanitizeHtml(pagesHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["class"],
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // 自定义证件照是 data URL；相对地址 /api/photo 仍允许（无 scheme）。
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attribs) => {
        const src = typeof attribs.src === "string" ? attribs.src : "";
        const allowed =
          src === "/api/photo" ||
          /^data:image\/(?:png|jpeg|webp);base64,/i.test(src);
        if (allowed) return { tagName, attribs };
        const { src: _discarded, ...rest } = attribs;
        return { tagName, attribs: rest };
      },
    },
    disallowedTagsMode: "discard",
    parser: {
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
    },
  });
}

function findBrowserExecutable(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }

  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    // Playwright 浏览器未安装时忽略。
  }

  return null;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const browser = await browserPromise;
    if (browser.isConnected()) return browser;
    browserPromise = null;
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new HttpError(
      503,
      "NO_BROWSER",
      "未找到可用于打印 PDF 的 Chrome/Edge。请安装 Chrome、Edge，或通过 CHROME_PATH 指定浏览器路径。",
    );
  }

  const launchArgs = ["--font-render-hinting=none", "--disable-lcd-text"];
  if (process.env.CHROME_NO_SANDBOX === "1") {
    launchArgs.push("--no-sandbox");
  }

  browserPromise = chromium
    .launch({
      headless: true,
      executablePath,
      args: launchArgs,
    })
    .catch((error) => {
      browserPromise = null;
      throw error;
    });

  return browserPromise;
}

async function renderOnce(fullHtml: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return route.abort();
      }
      return route.continue();
    });

    await page.setContent(fullHtml, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(async () => {
      if (document.fonts) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
    });

    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close().catch(() => undefined);
  }
}

let renderQueue: Promise<unknown> = Promise.resolve();

export interface PdfRequest {
  pagesHtml: string;
  style: unknown;
  title: string;
}

export function generateResumePdf(request: PdfRequest): Promise<Buffer> {
  const task = renderQueue.then(() => renderResumePdf(request));
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function renderResumePdf(request: PdfRequest): Promise<Buffer> {
  if (typeof request.pagesHtml !== "string" || !request.pagesHtml.trim()) {
    throw new HttpError(400, "NO_PAGES", "没有可导出的简历页面。");
  }
  if (Buffer.byteLength(request.pagesHtml, "utf8") > MAX_HTML_BYTES) {
    throw new HttpError(413, "HTML_TOO_LARGE", "简历页面数据过大，无法导出。");
  }

  const sanitized = sanitizePages(request.pagesHtml);
  const pageCount = (
    sanitized.match(/<section\b[^>]*class="[^"]*\br-page\b/g) ?? []
  ).length;

  if (pageCount === 0) {
    throw new HttpError(400, "NO_PAGES", "页面结构无效，未生成 PDF。");
  }
  if (pageCount > MAX_PAGES) {
    throw new HttpError(400, "TOO_MANY_PAGES", `页数超过 ${MAX_PAGES} 页，已停止导出。`);
  }

  const photo = await photoDataUri();
  const pagesHtml = photo
    ? sanitized.replaceAll('src="/api/photo"', `src="${photo}"`)
    : sanitized;

  const style: StyleConfig = normalizeStyle(request.style);
  const cssVars = Object.entries(styleToCssVars(style))
    .map(([key, value]) => `${key}:${value};`)
    .join("");

  const resumeCss = await fs.readFile(RESUME_CSS_PATH, "utf8");
  const safeTitle =
    typeof request.title === "string" && request.title.trim()
      ? request.title.trim().slice(0, 120)
      : "简历";

  const fullHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(safeTitle)} - 简历</title>
<style>${resumeCss}</style>
<style>${PRINT_CSS}</style>
<style>.r-pages{${cssVars}}</style>
</head>
<body>
<div class="r-pages r-template--${style.template}">${pagesHtml}</div>
</body>
</html>`;

  return renderOnce(fullHtml);
}

export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const promise = browserPromise;
  browserPromise = null;
  try {
    const browser = await promise;
    await browser.close();
  } catch {
    // ignore
  }
}
