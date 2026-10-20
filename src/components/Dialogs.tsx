import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api";
import type { FileInfo } from "../types";

interface ModalProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
}

export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 560,
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="icon-button close-button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

const formatTime = (value: number): string => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

interface OpenDialogProps {
  files: FileInfo[];
  currentName: string | null;
  pdfReference: string | null;
  busy: boolean;
  onOpenWorkspace: (name: string) => void;
  onOpenLocal: (file: File, content: string) => void;
  onNew: () => void;
  onClose: () => void;
}

export function OpenDialog({
  files,
  currentName,
  pdfReference,
  busy,
  onOpenWorkspace,
  onOpenLocal,
  onNew,
  onClose,
}: OpenDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <Modal
      title="打开 Markdown"
      subtitle="可打开工作区文件、从电脑导入 .md，或新建一份空白简历。"
      onClose={onClose}
      width={580}
      footer={
        <>
          <button
            type="button"
            className="button ghost"
            onClick={onNew}
            disabled={busy}
          >
            新建空白简历
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            从电脑选择…
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            取消
          </button>
        </>
      }
    >
      <div className="file-list" role="listbox" aria-label="工作区 Markdown 文件">
        {files.length === 0 ? (
          <div className="file-list-empty">
            工作区根目录暂无 Markdown 文件，可使用「另存为」创建。
          </div>
        ) : (
          files.map((file) => (
            <button
              type="button"
              key={file.name}
              role="option"
              aria-selected={file.name === currentName}
              className={`file-row${file.name === currentName ? " is-current" : ""}`}
              disabled={busy}
              onClick={() => onOpenWorkspace(file.name)}
            >
              <span className="file-row-main">
                <span className="file-row-name">{file.name}</span>
                {file.name === currentName ? (
                  <span className="file-row-badge">当前</span>
                ) : null}
              </span>
              <span className="file-row-meta">
                {formatTime(file.mtime)} · {formatSize(file.size)}
              </span>
            </button>
          ))
        )}
      </div>

      {localError ? <p className="form-error">{localError}</p> : null}

      {pdfReference ? (
        <p className="reference-note">
          <span className="reference-label">样式参考（只读）</span>
          <span className="reference-name">{pdfReference}</span>
          <a
            className="reference-link"
            href="/api/reference-pdf"
            target="_blank"
            rel="noreferrer noopener"
          >
            在新标签页打开参考 PDF
          </a>
          <span className="reference-hint">
            工具不会写入或覆盖该 PDF 文件。
          </span>
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setLocalError(null);
          if (!/\.(md|markdown)$/i.test(file.name)) {
            setLocalError("请选择扩展名为 .md 或 .markdown 的文件。");
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            setLocalError("文件超过 5 MB，已取消读取。");
            return;
          }
          try {
            const content = (await file.text())
              .replace(/^\uFEFF/, "")
              .replace(/\r\n?/g, "\n");
            onOpenLocal(file, content);
          } catch {
            setLocalError("读取本地文件失败，请重试。");
          }
        }}
      />
    </Modal>
  );
}

interface ExportPasswordDialogProps {
  error: string | null;
  loading: boolean;
  onSubmit: (password: string) => void;
  onClose: () => void;
}

export function ExportPasswordDialog({
  error,
  loading,
  onSubmit,
  onClose,
}: ExportPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (loading) return;
    if (!password.trim()) {
      setLocalError("请输入导出密码。");
      return;
    }
    setLocalError(null);
    onSubmit(password);
  };

  return (
    <Modal
      title="导出密码"
      subtitle="输入正确密码后才会生成并下载 PDF。"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="button ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="button primary"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "验证中…" : "验证并导出"}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">密码</span>
        <input
          type="password"
          className="text-input"
          value={password}
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          onChange={(event) => {
            setPassword(event.target.value);
            setLocalError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>
      {localError || error ? (
        <p className="form-error">{localError ?? error}</p>
      ) : null}
      <p className="form-hint">
        密码由服务器校验，不会保存在前端。验证成功后，当前浏览器会话可在 2
        小时内继续导出。
      </p>
    </Modal>
  );
}

interface SaveAsDialogProps {
  defaultName: string;
  saving: boolean;
  onSave: (name: string, overwrite: boolean) => Promise<void>;
  onClose: () => void;
}

export function SaveAsDialog({
  defaultName,
  saving,
  onSave,
  onClose,
}: SaveAsDialogProps) {  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const submit = async (overwrite: boolean) => {
    setError(null);
    let next = name.trim();
    if (!next) {
      setError("请输入文件名。");
      return;
    }
    if (/[\\/:*?"<>|]/.test(next)) {
      setError("文件名不能包含 \\ / : * ? \" < > | 等字符。");
      return;
    }
    if (!/\.md$/i.test(next)) next = `${next}.md`;
    setName(next);
    try {
      await onSave(next, overwrite);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        setError(`「${next}」已存在。再次保存将覆盖该文件。`);
        return;
      }
      setConflict(false);
      setError(err instanceof Error ? err.message : "保存失败，请重试。");
    }
  };

  return (
    <Modal
      title="另存为 Markdown"
      subtitle="文件会保存到工作区根目录，与当前简历和参考 PDF 同目录。"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="button ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={`button ${conflict ? "danger" : "primary"}`}
            onClick={() => void submit(conflict)}
            disabled={saving}
          >
            {saving ? "保存中…" : conflict ? "覆盖并保存" : "保存"}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">文件名</span>
        <input
          className="text-input"
          value={name}
          autoFocus
          spellCheck={false}
          onChange={(event) => {
            setName(event.target.value);
            setConflict(false);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) {
              event.preventDefault();
              void submit(conflict);
            }
          }}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="form-hint">
        扩展名会自动补全为 .md。保存成功后，当前文件将切换到新路径。
      </p>
    </Modal>
  );
}
