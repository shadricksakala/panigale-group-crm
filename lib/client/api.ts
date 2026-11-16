export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? value as Record<string, unknown> : { error: raw };
  } catch {
    return { error: raw };
  }
}

function fail(data: Record<string, unknown>, status: number) {
  if (status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("crm:unauthorized"));
  return new ApiError(String(data.error || data.message || "Request failed."), status);
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  const data = await readPayload(response);
  if (!response.ok) throw fail(data, response.status);
  return data as T;
}

export async function csrfToken() {
  const response = await fetch("/api/security/csrf", { credentials: "same-origin", cache: "no-store" });
  const data = await readPayload(response);
  if (!response.ok) throw fail(data, response.status);
  return String(data.token || "");
}

export async function secureJson<T = Record<string, unknown>>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const token = await csrfToken();
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-crm-csrf": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readPayload(response);
  if (!response.ok) throw fail(data, response.status);
  return data as T;
}

export async function secureForm<T = Record<string, unknown>>(path: string, form: FormData): Promise<T> {
  const token = await csrfToken();
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "x-crm-csrf": token }, body: form });
  const data = await readPayload(response);
  if (!response.ok) throw fail(data, response.status);
  return data as T;
}
