import { useState } from "react";

interface LoginScreenProps {
  busy: boolean;
  error: string | null;
  onSubmit: (username: string, password: string) => void;
}

export function LoginScreen({ busy, error, onSubmit }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (busy) return;
    if (!username.trim() || !password) {
      setLocalError("请输入用户名和密码。");
      return;
    }
    setLocalError(null);
    onSubmit(username.trim(), password);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>Resume Studio</span>
        </div>
        <h1 className="login-title">登录</h1>
        <p className="login-subtitle">
          使用已分配的账号继续编辑你的简历。
        </p>

        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="field">
            <span className="field-label">用户名</span>
            <input
              className="text-input"
              value={username}
              autoFocus
              autoComplete="username"
              spellCheck={false}
              onChange={(event) => {
                setUsername(event.target.value);
                setLocalError(null);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">密码</span>
            <input
              type="password"
              className="text-input"
              value={password}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                setLocalError(null);
              }}
            />
          </label>
          {localError || error ? (
            <p className="form-error" role="alert">
              {localError ?? error}
            </p>
          ) : null}
          <button
            type="submit"
            className="button primary login-submit"
            disabled={busy}
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="login-note">当前不开放注册，请使用已分配的账号。</p>
      </div>
      <p className="login-footnote">
        简历数据保存在 MySQL 中，登录后只显示当前账号的内容。
      </p>
    </div>
  );
}
