import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  getMe,
  getResume,
  login as loginApi,
  logout as logoutApi,
  photoUrl,
  saveResume,
  type ResumeResponse,
  type User,
} from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { PreviewPane } from "./components/PreviewPane";
import { SplitPane } from "./components/SplitPane";
import { StylePanel } from "./components/StylePanel";
import { ToastStack } from "./components/ToastStack";
import { Toolbar } from "./components/Toolbar";
import { parseResume } from "./resume/parser";
import {
  DEFAULT_STYLE,
  normalizeStyle,
  type StyleConfig,
} from "./resume/style";
import type { ResumeLayout } from "./resume/usePagination";
import { loadSplit, loadStyle, saveSplit, saveStyle } from "./storage";
import type { ToastMessage } from "./types";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [photoAvailable, setPhotoAvailable] = useState(false);
  const [style, setStyle] = useState<StyleConfig>(() => loadStyle());
  const [styleOpen, setStyleOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | null>(null);
  const [layout, setLayout] = useState<ResumeLayout>({
    pageCount: 0,
    overflow: false,
    ready: false,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [split, setSplit] = useState(() => loadSplit());

  const pagesRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(1);
  const actionLockRef = useRef(false);

  const parsed = useMemo(() => parseResume(content), [content]);
  const dirty = content !== savedContent;
  const photoSrc = useMemo(
    () =>
      style.photoDataUrl ??
      (photoAvailable && user ? photoUrl() : ""),
    [photoAvailable, style.photoDataUrl, user],
  );

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "info") => {
      const id = toastIdRef.current;
      toastIdRef.current += 1;
      setToasts((current) => [...current, { id, text, tone }]);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const applyResume = useCallback((resume: ResumeResponse) => {
    setContent(resume.content);
    setSavedContent(resume.content);
    setUpdatedAtMs(resume.updatedAtMs);
    setPhotoAvailable(resume.photoAvailable);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const auth = await getMe();
        if (!auth.authenticated || !auth.user) {
          return;
        }
        const resume = await getResume();
        if (cancelled) return;
        setUser(auth.user);
        applyResume(resume);
      } catch (error) {
        if(!cancelled) {
          setLoginError(
            error instanceof Error
              ? error.message
              : "无法连接服务器，请稍后再试。",
          );
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [applyResume]);

  useEffect(() => {
    saveStyle(style);
  }, [style]);

  useEffect(() => {
    saveSplit(split);
  }, [split]);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      if (loginBusy) return;
      setLoginBusy(true);
      setLoginError(null);
      try {
        const nextUser = await loginApi(username, password);
        const resume = await getResume();
        setUser(nextUser);
        applyResume(resume);
        pushToast(`欢迎回来，${nextUser.displayName}`, "success");
      } catch (error) {
        setLoginError(
          error instanceof Error
            ? error.message
            : "登录失败，请稍后再试。",
        );
      } finally {
        setLoginBusy(false);
      }
    },
    [applyResume, loginBusy, pushToast],
  );

  const handleSave = useCallback(async () => {
    if (!user || busy || actionLockRef.current) return;
    if (!dirty) {
      pushToast("当前内容没有需要保存的修改。", "info");
      return;
    }

    actionLockRef.current = true;
    setBusy("save");
    try {
      const result = await saveResume(content);
      setSavedContent(content);
      setUpdatedAtMs(result.updatedAtMs);
      pushToast("已保存到 MySQL。", "success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setLoginError("登录已过期，请重新登录。");
        return;
      }
      pushToast(
        error instanceof Error ? error.message : "保存失败，请重试。",
        "error",
      );
    } finally {
      actionLockRef.current = false;
      setBusy(null);
    }
  }, [busy, content, dirty, pushToast, user]);

  const handleLogout = useCallback(async () => {
    if (dirty && !window.confirm("有未保存的修改，确定退出登录？")) {
      return;
    }
    try {
      await logoutApi();
    } catch {
      // 即使请求失败也清理本地状态。
    }
    setUser(null);
    setContent("");
    setSavedContent("");
    setUpdatedAtMs(null);
    setPhotoAvailable(false);
    setStyleOpen(false);
    setLoginError(null);
    setToasts([]);
  }, [dirty]);

  const handleStyleChange = useCallback((patch: Partial<StyleConfig>) => {
    setStyle((previous) => normalizeStyle({ ...previous, ...patch }));
  }, []);

  const handleLayout = useCallback((next: ResumeLayout) => {
    setLayout((previous) =>
      previous.pageCount === next.pageCount &&
      previous.overflow === next.overflow &&
      previous.ready === next.ready
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!user) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape" && styleOpen) {
        setStyleOpen(false);
        return;
      }
      if (!mod || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, styleOpen, user]);

  if (!authChecked) {
    return (
      <div className="boot-screen">
        <div className="boot-mark" aria-hidden="true">
          R
        </div>
        <p className="boot-text">正在验证登录状态…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        busy={loginBusy}
        error={loginError}
        onSubmit={(username, password) => void handleLogin(username, password)}
      />
    );
  }

  const statusText = (() => {
    if (busy === "save") return "正在保存到 MySQL…";
    if (dirty) return "未保存的修改";
    if (updatedAtMs) {
      return `已保存 ${timeFormatter.format(new Date(updatedAtMs))}`;
    }
    return "已载入";
  })();

  return (
    <div className="app-shell">
      <Toolbar
        user={user}
        dirty={dirty}
        busy={busy}
        styleOpen={styleOpen}
        onSave={() => void handleSave()}
        onToggleStyle={() => setStyleOpen((open) => !open)}
        onLogout={() => void handleLogout()}
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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
