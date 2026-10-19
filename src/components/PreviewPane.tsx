import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ResumeFlow } from "../resume/ResumeBlocks";
import type { ResumeBlock } from "../resume/parser";
import { styleToCssVars, type StyleConfig } from "../resume/style";
import { usePagination, type ResumeLayout } from "../resume/usePagination";

const A4_WIDTH_PX = (210 * 96) / 25.4;

interface PreviewPaneProps {
  blocks: ResumeBlock[];
  style: StyleConfig;
  photoSrc: string;
  pagesRef: RefObject<HTMLDivElement | null>;
  onLayout: (layout: ResumeLayout) => void;
  onStyleChange: (patch: Partial<StyleConfig>) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function PreviewPane({
  blocks,
  style,
  photoSrc,
  pagesRef,
  onLayout,
  onStyleChange,
}: PreviewPaneProps) {
  const measureRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef(style);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  styleRef.current = style;

  const { pages, overflow, ready } = usePagination({
    blocks,
    style,
    measureRef,
    onLayout,
  });

  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState(true);

  const cssVars = useMemo(
    () => styleToCssVars(style) as CSSProperties,
    [style],
  );

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
    },
    [],
  );

  const handlePhotoPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null;
    const image = target?.closest?.(".r-photo") as HTMLImageElement | null;
    if (!image || !styleRef.current.showPhoto) return;

    const page = image.closest(".r-page") as HTMLElement | null;
    if (!page) return;

    event.preventDefault();
    event.stopPropagation();

    const pageRect = page.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0) return;
    const scaleX = 210 / pageRect.width;
    const scaleY = 297 / pageRect.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = styleRef.current.photoX;
    const startY = styleRef.current.photoY;

    dragCleanupRef.current?.();
    document.body.classList.add("is-dragging-photo");

    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("is-dragging-photo");
      dragCleanupRef.current = null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      const width = styleRef.current.photoWidth;
      const height = styleRef.current.photoHeight;
      const nextX = clamp(
        startX + (moveEvent.clientX - startClientX) * scaleX,
        0,
        210 - width,
      );
      const nextY = clamp(
        startY + (moveEvent.clientY - startClientY) * scaleY,
        0,
        297 - height,
      );
      onStyleChange({
        photoX: Math.round(nextX * 10) / 10,
        photoY: Math.round(nextY * 10) / 10,
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    dragCleanupRef.current = finish;
  };

  const calculateFit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 100;
    const available = el.clientWidth - 64;
    return clamp(Math.round((available / A4_WIDTH_PX) * 1000) / 10, 40, 130);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (fitMode) setZoom(calculateFit());
    });
    observer.observe(el);
    if (fitMode) setZoom(calculateFit());
    return () => observer.disconnect();
  }, [calculateFit, fitMode]);

  const setManualZoom = (next: number) => {
    setFitMode(false);
    setZoom(clamp(Math.round(next), 40, 150));
  };

  return (
    <section className="preview-pane" aria-label="A4 简历预览">
      <div className="pane-head preview-head">
        <div className="pane-title">
          <span className="pane-title-text">A4 预览</span>
          <span className="preview-pages-badge" aria-live="polite">
            {ready ? `${pages.length} 页` : "排版中"}
          </span>
        </div>
        <div className="zoom-controls" role="group" aria-label="预览缩放">
          <button
            type="button"
            className="icon-button"
            onClick={() => setManualZoom(zoom - 10)}
            aria-label="缩小预览"
            title="缩小"
          >
            −
          </button>
          <button
            type="button"
            className="zoom-value"
            onClick={() => {
              setFitMode(false);
              setZoom(100);
            }}
            title="重置为 100%"
          >
            {Math.round(zoom)}%
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setManualZoom(zoom + 10)}
            aria-label="放大预览"
            title="放大"
          >
            +
          </button>
          <button
            type="button"
            className={`fit-button${fitMode ? " is-active" : ""}`}
            onClick={() => {
              setFitMode(true);
              setZoom(calculateFit());
            }}
            title="按可用宽度缩放"
          >
            适合宽度
          </button>
        </div>
      </div>

      {overflow ? (
        <div className="preview-banner is-error" role="alert">
          存在超过一页高度的内容块，导出已暂停。请拆分该段内容，或适当调小字号、行高。
        </div>
      ) : ready && pages.length > 1 ? (
        <div className="preview-banner is-info">
          内容共 {pages.length} 页（A4）。工具不会自动缩小字体；可调整字号、行高、边距或精简内容。
        </div>
      ) : null}

      <div className="preview-scroll" ref={scrollRef}>
        {ready ? (
          <div className="preview-canvas">
            <div
              className="preview-zoom"
              style={{ zoom: zoom / 100 } as CSSProperties}
            >
              <div
                className={`preview-pages r-template--${style.template}`}
                ref={pagesRef}
                style={cssVars}
                onPointerDown={handlePhotoPointerDown}
              >
                {pages.map((pageBlocks, index) => (
                  <div className="preview-page-shell" key={index}>
                    <section
                      className={`r-page${overflow ? " r-page--warning" : ""}`}
                      data-page={index + 1}
                    >
                      <div className="r-page-inner">
                        <ResumeFlow
                          blocks={pageBlocks}
                          style={style}
                          photoSrc={photoSrc}
                        />
                      </div>
                    </section>
                    <div className="page-label">
                      第 {index + 1} 页 / 共 {pages.length} 页
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="preview-loading">正在排版…</div>
        )}
      </div>

      <div className="preview-measure" aria-hidden="true">
        <div className={`r-pages r-template--${style.template}`} style={cssVars}>
          <div className="r-measure-inner" ref={measureRef}>
            <ResumeFlow blocks={blocks} style={style} photoSrc={photoSrc} />
          </div>
        </div>
      </div>
    </section>
  );
}
