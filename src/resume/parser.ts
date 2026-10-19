export type BlockKind =
  | "hero"
  | "section"
  | "entry"
  | "subheading"
  | "paragraph"
  | "list-item"
  | "hr";

interface BlockBase {
  id: string;
  kind: BlockKind;
}

export interface HeroBlock extends BlockBase {
  kind: "hero";
  name: string;
  lines: string[];
}

export interface SectionBlock extends BlockBase {
  kind: "section";
  title: string;
}

export interface EntryBlock extends BlockBase {
  kind: "entry";
  cells: string[];
}

export interface SubheadingBlock extends BlockBase {
  kind: "subheading";
  text: string;
}

export interface ParagraphBlock extends BlockBase {
  kind: "paragraph";
  text: string;
  variant: "body" | "tech" | "note";
}

export interface ListItemBlock extends BlockBase {
  kind: "list-item";
  text: string;
}

export interface HrBlock extends BlockBase {
  kind: "hr";
}

export type ResumeBlock =
  | HeroBlock
  | SectionBlock
  | EntryBlock
  | SubheadingBlock
  | ParagraphBlock
  | ListItemBlock
  | HrBlock;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type BlockWithoutId = DistributiveOmit<ResumeBlock, "id">;

export interface ParsedResume {
  title: string;
  blocks: ResumeBlock[];
}

const FILLER_CHARS = /[\u3164\u200b\u200c\u200d\ufeff\u00a0]/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s{0,3}([-*+])\s+(.*)$/;
const HR_RE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const FENCE_START_RE = /^\s*:::\s*start\b/i;
const FENCE_END_RE = /^\s*:::\s*end\b/i;
const FENCE_SEP_RE = /^\s*:::\s*$/;

const isFillerOnly = (text: string): boolean =>
  text.replace(FILLER_CHARS, "").trim() === "";

const stripClosingHashes = (text: string): string =>
  text.replace(/\s+#+\s*$/, "").trim();

const isSpecialStart = (line: string): boolean => {
  const text = line.trim();
  if (!text) return true;
  if (HEADING_RE.test(text)) return true;
  if (text.startsWith(":::")) return true;
  if (BULLET_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  return false;
};

interface FenceResult {
  next: number;
  block: EntryBlock | null;
}

function readFence(lines: string[], start: number): FenceResult {
  const cells: string[][] = [[]];
  let i = start + 1;

  // 未闭合的 ::: 块按到文件末尾处理，避免静默吞掉后续内容。
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE_END_RE.test(line)) {
      i += 1;
      break;
    }
    if (FENCE_SEP_RE.test(line)) {
      cells.push([]);
      i += 1;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed) cells[cells.length - 1].push(trimmed);
    i += 1;
  }

  const cleaned = cells
    .map((cell) => cell.join("\n").trim())
    .filter((cell, index, all) => {
      if (cell) return true;
      // 保留中间空单元格，用于对齐三列布局；去掉纯尾随空列。
      return all.slice(index + 1).some((next) => next.trim() !== "");
    });

  if (cleaned.length === 0 || cleaned.every(isFillerOnly)) {
    return { next: i, block: null };
  }

  return {
    next: i,
    block: {
      id: "",
      kind: "entry",
      cells: cleaned,
    },
  };
}

const LABEL_RE = /^\s*(?:\*\*[^*]+\*\*|[^：:\n]{1,12})\s*[：:]/;
const TECH_RE = /^\s*(?:\*\*)?技术栈(?:\*\*)?\s*[：:]/;

export function parseResume(markdown: string): ParsedResume {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ResumeBlock[] = [];
  let title = "简历";
  let heroSeen = false;
  let previousKind: BlockKind | null = null;

  const push = (block: BlockWithoutId): void => {
    const withId = { ...block, id: `b${blocks.length}` } as ResumeBlock;
    blocks.push(withId);
    previousKind = withId.kind;
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (FENCE_START_RE.test(line)) {
      const result = readFence(lines, i);
      if (result.block) push(result.block);
      i = result.next;
      continue;
    }

    if (FENCE_END_RE.test(line) || FENCE_SEP_RE.test(line)) {
      // 游离的 ::: 行不产生正文内容。
      i += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const text = stripClosingHashes(heading[2]);
      if (level === 1 && !heroSeen) {
        title = text || "简历";
        heroSeen = true;
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j += 1;
        const heroLines: string[] = [];
        while (j < lines.length && lines[j].trim() && !isSpecialStart(lines[j])) {
          heroLines.push(lines[j].trim());
          j += 1;
        }
        push({ kind: "hero", name: title, lines: heroLines });
        i = j;
        continue;
      }

      if (level <= 2) {
        push({ kind: "section", title: text });
      } else {
        push({ kind: "subheading", text });
      }
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      push({ kind: "hr" });
      i += 1;
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const itemLines = [bullet[2].trim()];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim() &&
        !isSpecialStart(lines[j])
      ) {
        itemLines.push(lines[j].trim());
        j += 1;
      }
      push({ kind: "list-item", text: itemLines.join(" ") });
      i = j;
      continue;
    }

    // 普通段落：连续非空、非块级起始标志的行。
    const paragraphLines: string[] = [];
    let j = i;
    while (j < lines.length && lines[j].trim() && !isSpecialStart(lines[j])) {
      paragraphLines.push(lines[j].replace(/\s+$/, ""));
      j += 1;
    }

    if (paragraphLines.length === 0) {
      i += 1;
      continue;
    }

    const text = paragraphLines.join("\n").trim();
    const isTech = TECH_RE.test(text);
    const isNote =
      previousKind === "entry" && !isTech && !LABEL_RE.test(text);
    push({
      kind: "paragraph",
      text,
      variant: isTech ? "tech" : isNote ? "note" : "body",
    });
    i = j;
  }

  return { title, blocks };
}

export function keepWithNext(block: ResumeBlock): boolean {
  return (
    block.kind === "section" ||
    block.kind === "subheading" ||
    block.kind === "entry"
  );
}

export function blockLabel(block: ResumeBlock): string {
  switch (block.kind) {
    case "hero":
      return "页眉";
    case "section":
      return `模块「${block.title}」`;
    case "entry":
      return "经历标题行";
    case "subheading":
      return `标题「${block.text}」`;
    case "paragraph":
      return block.variant === "tech" ? "技术栈" : "段落";
    case "list-item":
      return "列表项";
    case "hr":
      return "分隔线";
  }
}
