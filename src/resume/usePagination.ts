import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { keepWithNext, type ResumeBlock } from "./parser";
import { pageContentHeightPx, type StyleConfig } from "./style";

export interface ResumeLayout {
  pageCount: number;
  overflow: boolean;
  ready: boolean;
}

interface MeasureItem {
  block: ResumeBlock;
  height: number;
}

interface UsePaginationOptions {
  blocks: ResumeBlock[];
  style: StyleConfig;
  measureRef: RefObject<HTMLDivElement | null>;
  onLayout: (layout: ResumeLayout) => void;
}

interface UsePaginationResult {
  pages: ResumeBlock[][];
  overflow: boolean;
  ready: boolean;
}

const TOLERANCE = 0.75;

/**
 * 把连续的简历块按固定 A4 页面高度切分。
 * 测量在屏幕外、缩放之外的同宽容器里完成，因此与预览缩放比例无关。
 */
export function usePagination({
  blocks,
  style,
  measureRef,
  onLayout,
}: UsePaginationOptions): UsePaginationResult {
  const [pages, setPages] = useState<ResumeBlock[][]>([]);
  const [overflow, setOverflow] = useState(false);
  const [ready, setReady] = useState(false);

  const blocksRef = useRef(blocks);
  const styleRef = useRef(style);
  blocksRef.current = blocks;
  styleRef.current = style;

  const measure = useCallback(() => {
    const container = measureRef.current;
    if (!container) return;

    const currentBlocks = blocksRef.current;
    if (currentBlocks.length === 0) {
      setPages([[]]);
      setOverflow(false);
      setReady(true);
      return;
    }

    const blockById = new Map(currentBlocks.map((block) => [block.id, block]));
    const items: MeasureItem[] = [];

    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const id = child.dataset.blockId;
      const block = id ? blockById.get(id) : undefined;
      if (!block) continue;
      const computed = window.getComputedStyle(child);
      const marginTop = Number.parseFloat(computed.marginTop) || 0;
      const marginBottom = Number.parseFloat(computed.marginBottom) || 0;
      const height = child.getBoundingClientRect().height;
      items.push({ block, height: marginTop + height + marginBottom });
    }

    if (items.length !== currentBlocks.length) {
      // 极少数情况下字体/图片尚未完成布局，等下一帧再测。
      return;
    }

    const contentHeight = pageContentHeightPx(styleRef.current);
    const nextPages: ResumeBlock[][] = [];
    let currentPage: ResumeBlock[] = [];
    let used = 0;
    let hasOverflow = false;

    const fits = (height: number): boolean =>
      used + height <= contentHeight + TOLERANCE;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const next = items[index + 1];
      const keep = keepWithNext(item.block);
      const required =
        item.height +
        (keep && next ? Math.min(next.height, contentHeight) : 0);

      if (currentPage.length > 0 && !fits(required)) {
        nextPages.push(currentPage);
        currentPage = [];
        used = 0;
      }

      if (item.height > contentHeight + TOLERANCE) {
        hasOverflow = true;
      }

      currentPage.push(item.block);
      used += item.height;
    }

    if (currentPage.length > 0) nextPages.push(currentPage);
    if (nextPages.length === 0) nextPages.push([]);

    // 不能只比较块 id：文本内容或块内样式变化时，分页结果可能相同，
    // 但页面里持有的仍是旧块对象。必须用新块对象替换页面内容。
    setPages(nextPages);
    setOverflow((previous) =>
      previous === hasOverflow ? previous : hasOverflow,
    );
    setReady(true);
  }, [measureRef]);

  useLayoutEffect(() => {
    measure();
    let cancelled = false;
    const fontSet = document.fonts;
    if (fontSet) {
      void fontSet.ready.then(() => {
        if (!cancelled) measure();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [blocks, style, measure]);

  useEffect(() => {
    onLayout({ pageCount: pages.length, overflow, ready });
  }, [onLayout, overflow, pages.length, ready]);

  return { pages, overflow, ready };
}
