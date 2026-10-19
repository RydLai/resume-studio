import { useEffect, useRef, useState, type ReactNode } from "react";

interface SplitPaneProps {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
}

const clamp = (value: number): number => Math.min(68, Math.max(30, value));

export function SplitPane({
  ratio,
  onRatioChange,
  left,
  right,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  const updateFromClientX = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    onRatioChange(clamp(Math.round(next * 10) / 10));
  };

  return (
    <div
      className={`split-pane${dragging ? " is-dragging" : ""}`}
      ref={containerRef}
      style={{
        gridTemplateColumns: `minmax(300px, ${ratio}fr) 7px minmax(340px, ${100 - ratio}fr)`,
      }}
    >
      <div className="split-left">{left}</div>

      <div
        className="split-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整编辑器与预览宽度"
        aria-valuemin={30}
        aria-valuemax={68}
        aria-valuenow={Math.round(ratio)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          updateFromClientX(event.clientX);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => onRatioChange(44)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onRatioChange(
              clamp(ratio + (event.key === "ArrowLeft" ? -2 : 2)),
            );
          }
        }}
        title="拖动调整宽度，双击恢复默认"
      >
        <span className="split-divider-line" />
      </div>

      <div className="split-right">{right}</div>
    </div>
  );
}
