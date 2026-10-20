import type { CurrentFile } from "../types";

interface ToolbarProps {
  file: CurrentFile | null;
  dirty: boolean;
  busy: "save" | "export" | null;
  styleOpen: boolean;
  canExport: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleStyle: () => void;
  onExport: () => void;
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2v7m0 0 2.6-2.6M8 9 5.4 6.4M3 10.5v2.2c0 .7.6 1.3 1.3 1.3h7.4c.7 0 1.3-.6 1.3-1.3v-2.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Toolbar({
  file,
  dirty,
  busy,
  styleOpen,
  canExport,
  onOpen,
  onSave,
  onSaveAs,
  onToggleStyle,
  onExport,
}: ToolbarProps) {
  const sourceLabel =
    file?.source === "local"
      ? "本地"
      : file?.source === "new"
        ? "新建"
        : "工作区";
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="brand" title="Resume Studio">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span className="brand-name">Resume Studio</span>
        </div>

        <span className="toolbar-divider" aria-hidden="true" />

        <div
          className="file-chip"
          title={
            file
              ? `${file.name}（${sourceLabel}${dirty ? "，有未保存修改" : ""}）`
              : "未打开文件"
          }
        >
          <span className="file-chip-label">{sourceLabel}</span>
          <span className="file-name">{file?.name ?? "未打开文件"}</span>
          {dirty ? (
            <span className="dirty-dot" aria-label="有未保存修改" title="有未保存修改" />
          ) : null}
        </div>
      </div>

      <div className="toolbar-right">
        <button type="button" className="button ghost" onClick={onOpen}>
          打开
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={onSave}
          disabled={busy === "save"}
          title="保存到工作区文件（Ctrl+S）"
        >
          {busy === "save" ? "保存中…" : "保存"}
        </button>
        <button type="button" className="button ghost" onClick={onSaveAs}>
          另存为
        </button>

        <span className="toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`button ghost${styleOpen ? " is-active" : ""}`}
          onClick={onToggleStyle}
          aria-pressed={styleOpen}
        >
          样式
        </button>
        <button
          type="button"
          className="button primary"
          onClick={onExport}
          disabled={busy === "export" || !canExport}
          title={
            canExport
              ? "导出 A4 PDF（resume.pdf，需要导出密码）"
              : "预览排版完成且无溢出后才能导出"
          }
        >
          {busy === "export" ? (
            "生成中…"
          ) : (
            <>
              <DownloadIcon />
              导出 PDF
            </>
          )}
        </button>
      </div>
    </header>
  );
}
