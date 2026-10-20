import type { User } from "../api";

interface ToolbarProps {
  user: User;
  dirty: boolean;
  busy: "save" | null;
  styleOpen: boolean;
  onSave: () => void;
  onToggleStyle: () => void;
  onLogout: () => void;
}

export function Toolbar({
  user,
  dirty,
  busy,
  styleOpen,
  onSave,
  onToggleStyle,
  onLogout,
}: ToolbarProps) {
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
          title={`当前用户：${user.username}`}
        >
          <span className="file-chip-label">当前用户</span>
          <span className="file-name">{user.displayName}</span>
          {dirty ? (
            <span
              className="dirty-dot"
              aria-label="有未保存修改"
              title="有未保存修改"
            />
          ) : null}
        </div>
      </div>

      <div className="toolbar-right">
        <button
          type="button"
          className="button primary"
          onClick={onSave}
          disabled={busy === "save"}
          title="保存到 MySQL（Ctrl+S）"
        >
          {busy === "save" ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          className={`button ghost${styleOpen ? " is-active" : ""}`}
          onClick={onToggleStyle}
          aria-pressed={styleOpen}
        >
          样式
        </button>

        <span className="toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="button ghost"
          onClick={onLogout}
          title="退出当前账号"
        >
          退出
        </button>
      </div>
    </header>
  );
}
