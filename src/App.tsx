import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  exportPdf,
  getBootstrap,
  getExportAuthStatus,
  listFiles,
  photoUrl,
  readWorkspaceFile,
  saveWorkspaceFile,
  unlockExport,
} from "./api";
import {
  ExportPasswordDialog,
  OpenDialog,
  SaveAsDialog,
} from "./components/Dialogs";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { PreviewPane } from "./components/PreviewPane";
import { SplitPane } from "./components/SplitPane";
import { StylePanel } from "./components/StylePanel";
import { ToastStack } from "./components/ToastStack";
import { Toolbar } from "./components/Toolbar";
import { parseResume } from "./resume/parser";
import { NEW_RESUME_TEMPLATE } from "./resume/template";
import {
  DEFAULT_STYLE,
  normalizeStyle,
  type StyleConfig,
} from "./resume/style";
import type { ResumeLayout } from "./resume/usePagination";
import {
  loadDraft,
  loadSplit,
  loadStyle,
  removeDraft,
  saveDraft,
  saveSplit,
  saveStyle,
} from "./storage";
import type {
  CurrentFile,
  FileInfo,
  ToastMessage,
} from "./types";

type BootState = "loading" | "ready" | "error";
type ModalKind = "open" | "saveAs" | null;
type BusyKind = "save" | "export" | "open" | null;
type ToastTone = ToastMessage["tone"];

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

const sortFiles = (files: FileInfo[]): FileInfo[] =>
  [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

const workspaceFile = (info: FileInfo): CurrentFile => ({
  name: info.name,
  id: `ws:${info.name}`,
  source: "workspace",
  size: info.size,
  mtime: info.mtime,
});

export default function App() {
  const [bootState, setBootState] = useState<BootState>("loading");
  const [bootError, setBootError] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [pdfReference, setPdfReference] = useState<string | null>(null);
  const [photoAvailable, setPhotoAvailable] = useState(false);
  const [file, setFile] = useState<CurrentFile | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [style, setStyle] = useState<StyleConfig>(() => loadStyle());
  const [styleOpen, setStyleOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [exportAuthOpen, setExportAuthOpen] = useState(false);
  const [exportAuthError, setExportAuthError] = useState<string | null>(null);
  const [unlockingExport, setUnlockingExport] = useState(false);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [layout, setLayout] = useState<ResumeLayout>({
    pageCount: 0,
    overflow: false,
    ready: false,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [split, setSplit] = useState(() => loadSplit());

  const pagesRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(1);
  const bootStartedRef = useRef(false);
  const actionLockRef = useRef(false);
  const styleRef = useRef(style);
  styleRef.current = style;

  const dirty = content !== savedContent;
  const parsed = useMemo(() => parseResume(content), [content]);
  const photoSrc =
    style.photoDataUrl ?? (photoAvailable ? photoUrl() : "");

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;
    setToasts((previous) => [...previous, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4600);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const boot = async () => {
      try {
        const payload = await getBootstrap();
        setFiles(sortFiles(payload.files));
        setPdfReference(payload.pdfReference);
        setPhotoAvailable(payload.photoAvailable);

        if (payload.currentFile) {
          const current = workspaceFile(payload.currentFile);
          const draft = loadDraft(current.id);
          setFile(current);
          setSavedContent(payload.content);
          setLastSavedAt(payload.currentFile.mtime);

          if (draft && draft.content !== payload.content) {
            setContent(draft.content);
            pushToast("已恢复上次未保存的本地草稿。", "info");
          } else {
            setContent(payload.content);
          }
        } else {
          setFile(null);
          setContent("");
          setSavedContent("");
          setLastSavedAt(null);
        }
        setBootState("ready");
      } catch (error) {
        setBootError(
          error instanceof Error ? error.message : "无法连接本地服务。",
        );
        setBootState("error");
      }
    };

    void boot();
  }, [pushToast]);

  useEffect(() => {
    // 照片 data URL 可能较大；拖动/滑杆连续变化时做短暂防抖，避免频繁写 localStorage。
    const timer = window.setTimeout(() => saveStyle(style), 180);
    return () => window.clearTimeout(timer);
  }, [style]);

  useEffect(() => {
    const flushStyle = () => saveStyle(styleRef.current);
    window.addEventListener("pagehide", flushStyle);
    return () => window.removeEventListener("pagehide", flushStyle);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveSplit(split), 200);
    return () => window.clearTimeout(timer);
  }, [split]);

  useEffect(() => {
    if (bootState !== "ready" || !file) return;
    const timer = window.setTimeout(() => {
      if (content === savedContent) {
        removeDraft(file.id);
      } else {
        saveDraft(file.id, {
          content,
          savedContent,
          updatedAt: Date.now(),
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bootState, content, file, savedContent]);

  const persistCurrentDraft = useCallback(() => {
    if (!file) return;
    if (content === savedContent) {
      removeDraft(file.id);
    } else {
      saveDraft(file.id, {
        content,
        savedContent,
        updatedAt: Date.now(),
      });
    }
  }, [content, file, savedContent]);

  useEffect(() => {
    const flushOnPageHide = () => persistCurrentDraft();
    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, [persistCurrentDraft]);

  const refreshFiles = useCallback(async () => {
    try {
      const payload = await listFiles();
      setFiles(sortFiles(payload.files));
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "刷新工作区文件列表失败。",
        "error",
      );
    }
  }, [pushToast]);

  const handleOpenDialog = useCallback(() => {
    setModal("open");
    void refreshFiles();
  }, [refreshFiles]);

  const handleSave = useCallback(async () => {
    if (!file || file.source !== "workspace") {
      setModal("saveAs");
      return;
    }
    if (busy || actionLockRef.current) return;
    actionLockRef.current = true;
    const snapshot = content;
    setBusy("save");
    try {
      const result = await saveWorkspaceFile({
        name: file.name,
        content: snapshot,
        overwrite: true,
      });
      setSavedContent(snapshot);
      setLastSavedAt(Date.now());
      setFile((previous) =>
        previous
          ? {
              ...previous,
              size: result.file.size,
              mtime: result.file.mtime,
            }
          : previous,
      );
      setFiles((previous) => {
        const others = previous.filter(
          (entry) => entry.name !== result.file.name,
        );
        return sortFiles([...others, result.file]);
      });
      removeDraft(file.id);
      pushToast(`已保存 ${result.file.name}`, "success");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "保存失败，请重试。",
        "error",
      );
    } finally {
      actionLockRef.current = false;
      setBusy(null);
    }
  }, [busy, content, file, pushToast]);

  const handleSaveAs = useCallback(
    async (name: string, overwrite: boolean) => {
      if (actionLockRef.current) return;
      actionLockRef.current = true;
      const snapshot = content;
      setBusy("save");
      try {
        const result = await saveWorkspaceFile({
          name,
          content: snapshot,
          overwrite,
        });
        const nextFile = workspaceFile(result.file);
        if (file) removeDraft(file.id);
        removeDraft(nextFile.id);
        setFile(nextFile);
        setSavedContent(snapshot);
        setLastSavedAt(result.mtime);
        setFiles((previous) => {
          const others = previous.filter(
            (entry) => entry.name !== result.file.name,
          );
          return sortFiles([...others, result.file]);
        });
        setModal(null);
        pushToast(`已另存为 ${result.file.name}`, "success");
      } finally {
        actionLockRef.current = false;
        setBusy(null);
      }
    },
    [content, file, pushToast],
  );

  const handleOpenWorkspace = useCallback(
    async (name: string) => {
      if (busy || actionLockRef.current) return;
      persistCurrentDraft();
      actionLockRef.current = true;
      setBusy("open");
      try {
        const payload = await readWorkspaceFile(name);
        const nextFile = workspaceFile(payload.file);
        const draft = loadDraft(nextFile.id);
        setFile(nextFile);
        setSavedContent(payload.content);
        setLastSavedAt(payload.file.mtime);
        if (draft && draft.content !== payload.content) {
          setContent(draft.content);
          pushToast("已恢复该文件的本地草稿。", "info");
        } else {
          setContent(payload.content);
        }
        setModal(null);
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : "打开文件失败。",
          "error",
        );
      } finally {
        actionLockRef.current = false;
        setBusy(null);
      }
    },
    [busy, persistCurrentDraft, pushToast],
  );

  const handleOpenLocal = useCallback(
    (localFile: File, localContent: string) => {
      persistCurrentDraft();
      const nextFile: CurrentFile = {
        name: localFile.name,
        id: `local:${localFile.name}`,
        source: "local",
        size: localFile.size,
        mtime: localFile.lastModified,
      };
      const draft = loadDraft(nextFile.id);
      setFile(nextFile);
      setSavedContent(localContent);
      setLastSavedAt(localFile.lastModified || null);
      if (draft && draft.content !== localContent) {
        setContent(draft.content);
        pushToast("已恢复该本地文件的草稿。", "info");
      } else {
        setContent(localContent);
      }
      setModal(null);
      pushToast("已导入本地文件；写入磁盘请使用「另存为」。", "info");
    },
    [persistCurrentDraft, pushToast],
  );

  const handleNewResume = useCallback(() => {
    persistCurrentDraft();
    setFile({
      name: "未命名简历.md",
      id: `new:${Date.now()}`,
      source: "new",
    });
    setContent(NEW_RESUME_TEMPLATE);
    setSavedContent("");
    setLastSavedAt(null);
    setModal(null);
    setStyleOpen(false);
    pushToast("已创建空白简历模板；保存时会提示另存为。", "info");
  }, [persistCurrentDraft, pushToast]);

  const handleExport = useCallback(async () => {
    if (busy || actionLockRef.current) return;
    if (!layout.ready || layout.pageCount === 0) {
      pushToast("预览排版尚未完成，请稍后再试。", "warning");
      return;
    }
    if (layout.overflow) {
      pushToast("存在超过单页高度的内容，已暂停导出。", "error");
      return;
    }

    actionLockRef.current = true;
    setBusy("export");
    try {
      const auth = await getExportAuthStatus();
      if (!auth.configured) {
        pushToast(
          "服务器未配置 PDF 导出密码，导出功能未启用。",
          "error",
        );
        return;
      }
      if (!auth.authorized) {
        setExportAuthError(null);
        setExportAuthOpen(true);
        return;
      }

      const container = pagesRef.current;
      const pageElements = container
        ? Array.from(container.querySelectorAll(".r-page"))
        : [];
      if (pageElements.length === 0) {
        pushToast("没有可导出的页面。", "error");
        return;
      }
      const pagesHtml = pageElements
        .map((element) => element.outerHTML)
        .join("");

      const blob = await exportPdf({
        pagesHtml,
        style,
        title: parsed.title,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "resume.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast(
        `PDF 已生成：resume.pdf（${layout.pageCount} 页 A4）`,
        "success",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setExportAuthError(null);
        setExportAuthOpen(true);
        return;
      }
      pushToast(
        error instanceof Error ? error.message : "PDF 导出失败，请重试。",
        "error",
      );
    } finally {
      actionLockRef.current = false;
      setBusy(null);
    }
  }, [busy, layout, parsed.title, pushToast, style]);

  const handleUnlockExport = useCallback(
    async (password: string) => {
      if (unlockingExport) return;
      setUnlockingExport(true);
      setExportAuthError(null);
      try {
        await unlockExport(password);
        setExportAuthOpen(false);
        await handleExport();
      } catch (error) {
        setExportAuthError(
          error instanceof Error ? error.message : "密码验证失败，请重试。",
        );
      } finally {
        setUnlockingExport(false);
      }
    },
    [handleExport, unlockingExport],
  );

  const handleLayout = useCallback((next: ResumeLayout) => {
    setLayout((previous) =>
      previous.pageCount === next.pageCount &&
      previous.overflow === next.overflow &&
      previous.ready === next.ready
        ? previous
        : next,
    );
  }, []);

  const handleStyleChange = useCallback((patch: Partial<StyleConfig>) => {
    setStyle((previous) => normalizeStyle({ ...previous, ...patch }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") {
        if (exportAuthOpen) return;
        if (modal) {
          setModal(null);
          return;
        }
        if (styleOpen) {
          setStyleOpen(false);
          return;
        }
      }
      if (!mod || modal || exportAuthOpen) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) setModal("saveAs");
        else void handleSave();
      } else if (key === "o") {
        event.preventDefault();
        handleOpenDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportAuthOpen, handleOpenDialog, handleSave, modal, styleOpen]);

  const statusText = (() => {
    if (busy === "save") return "正在保存到磁盘…";
    if (!file) return "未打开文件";
    if (dirty) return "未保存的修改 · 草稿已自动保存";
    if (file.source === "new") return "新建 · 尚未保存";
    if (file.source === "local") return "本地导入 · 尚未写入磁盘";
    if (lastSavedAt) return `已保存 ${timeFormatter.format(lastSavedAt)}`;
    return "已载入";
  })();

  const canExport =
    bootState === "ready" &&
    layout.ready &&
    layout.pageCount > 0 &&
    !layout.overflow &&
    content.trim().length > 0;

  if (bootState === "loading") {
    return (
      <div className="boot-screen">
        <div className="boot-mark" aria-hidden="true">
          R
        </div>
        <p className="boot-text">正在载入工作区简历…</p>
      </div>
    );
  }

  if (bootState === "error") {
    return (
      <div className="boot-screen">
        <div className="boot-mark" aria-hidden="true">
          R
        </div>
        <h1 className="boot-title">无法载入简历工作区</h1>
        <p className="boot-error">{bootError}</p>
        <p className="boot-hint">
          请确认本地服务已启动（<code>npm run dev</code>），然后重试。
        </p>
        <button
          type="button"
          className="button primary"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Toolbar
        file={file}
        dirty={dirty}
        busy={busy === "save" || busy === "export" ? busy : null}
        styleOpen={styleOpen}
        canExport={canExport}
        onOpen={handleOpenDialog}
        onSave={() => void handleSave()}
        onSaveAs={() => setModal("saveAs")}
        onToggleStyle={() => setStyleOpen((open) => !open)}
        onExport={() => void handleExport()}
      />

      <div className={`app-body${styleOpen ? " has-style-panel" : ""}`}>
        <SplitPane
          ratio={split}
          onRatioChange={setSplit}
          left={
            <MarkdownEditor
              value={content}
              onChange={setContent}
              dirty={dirty}
              statusText={statusText}
            />
          }
          right={
            <PreviewPane
              blocks={parsed.blocks}
              style={style}
              photoSrc={photoSrc}
              pagesRef={pagesRef}
              onLayout={handleLayout}
              onStyleChange={handleStyleChange}
            />
          }
        />
        <StylePanel
          open={styleOpen}
          style={style}
          photoSrc={photoSrc}
          hasDefaultPhoto={photoAvailable}
          onChange={handleStyleChange}
          onReset={() => setStyle(DEFAULT_STYLE)}
          onClose={() => setStyleOpen(false)}
        />
      </div>

      {modal === "open" ? (
        <OpenDialog
          files={files}
          currentName={file?.source === "workspace" ? file.name : null}
          pdfReference={pdfReference}
          busy={busy === "open"}
          onOpenWorkspace={(name) => void handleOpenWorkspace(name)}
          onOpenLocal={handleOpenLocal}
          onNew={handleNewResume}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "saveAs" ? (
        <SaveAsDialog
          defaultName={
            file?.name ??
            "resume.md"
          }
          saving={busy === "save"}
          onSave={handleSaveAs}
          onClose={() => setModal(null)}
        />
      ) : null}

      {exportAuthOpen ? (
        <ExportPasswordDialog
          error={exportAuthError}
          loading={unlockingExport}
          onSubmit={(password) => void handleUnlockExport(password)}
          onClose={() => {
            setExportAuthOpen(false);
            setExportAuthError(null);
          }}
        />
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
