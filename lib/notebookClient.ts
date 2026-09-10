import { supabaseBrowser } from "@/lib/supaBaseClient";

export class NotebookApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "NotebookApiError";
    this.status = status;
    this.code = code;
  }
}

export async function notebookApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new NotebookApiError("Unauthorized", 401);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new NotebookApiError(
      String(body?.error || "Notebook request failed"),
      response.status,
      typeof body?.code === "string" ? body.code : undefined
    );
  }
  return body as T;
}

export function notebookWorkspaceAction<T>(action: string, input: Record<string, unknown> = {}) {
  return notebookApi<T>("/api/notebook/workspace", {
    method: "POST",
    body: JSON.stringify({ action, ...input }),
  });
}
