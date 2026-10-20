export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface User {
  id: number;
  username: string;
  displayName: string;
}

export interface AuthState {
  authenticated: boolean;
  user: User | null;
}

export interface ResumeResponse {
  content: string;
  updatedAtMs: number;
  photoAvailable: boolean;
}

async function readError(response: Response): Promise<ApiError> {
  let message = `请求失败（HTTP ${response.status}）`;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      error?: string;
      code?: string;
    };
    if (payload.error) message = payload.error;
    code = payload.code;
  } catch {
    // 保持默认错误信息
  }
  return new ApiError(message, response.status, code);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

async function sendJson<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export function getMe(): Promise<AuthState> {
  return getJson<AuthState>("/api/auth/me");
}

export async function login(
  username: string,
  password: string,
): Promise<User> {
  const result = await sendJson<{ user: User }>("/api/auth/login", "POST", {
    username,
    password,
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await sendJson<{ ok: boolean }>("/api/auth/logout", "POST", {});
}

export function getResume(): Promise<ResumeResponse> {
  return getJson<ResumeResponse>("/api/resume");
}

export async function saveResume(
  content: string,
): Promise<{ updatedAtMs: number }> {
  return sendJson<{ updatedAtMs: number }>("/api/resume", "PUT", { content });
}

export function photoUrl(): string {
  return "/api/photo";
}
