export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;

  constructor(message: string, status: number, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

function requestError(message: string, status: number, requestId: string | null = null) {
  if (status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("panipay:unauthorized"));
  const detail = requestId ? `${message} (Reference ID: ${requestId})` : message;
  return new ApiError(detail, status, requestId);
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { error: raw };
  } catch {
    // A few domain validation routes still return a plain-text Response. Preserve
    // that actionable message for the UI instead of reducing it to “Request failed”.
    return { error: raw };
  }
}

export async function csrfToken() {
  const response = await fetch("/api/security/csrf", { credentials: "same-origin" });
  const data = await parseResponse(response);
  if (!response.ok) throw requestError(String(data.error || "Unable to prepare a secure request"), response.status, String(data.requestId || response.headers.get("x-request-id") || "") || null);
  return String(data.token || "");
}

export async function secureJson<T = Record<string, unknown>>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, idempotencyKey?: string): Promise<T> {
  const token = await csrfToken();
  const headers: Record<string, string> = { "content-type": "application/json", "x-panipay-csrf": token };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const response = await fetch(path, { method, credentials: "same-origin", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await parseResponse(response);
  if (!response.ok) throw requestError(String(data.error || data.message || "Request failed"), response.status, String(data.requestId || response.headers.get("x-request-id") || "") || null);
  return data as T;
}

export async function getJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  const data = await parseResponse(response);
  if (!response.ok) throw requestError(String(data.error || "Request failed"), response.status, String(data.requestId || response.headers.get("x-request-id") || "") || null);
  return data as T;
}
