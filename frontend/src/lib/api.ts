export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FastApiValidationDetail = Array<{
  msg?: string;
  loc?: Array<string | number>;
}>;

const fieldLabels: Record<string, string> = {
  aadhaar_number: "Aadhaar / ID Number",
  old_room_number: "Old Room Number",
  contact_number: "Contact Number",
  priority_category: "Priority Category",
  full_name: "Full Name",
  family_members: "Family Members",
  building_wing: "Building/Wing",
  consent: "Consent"
};

function cleanValidationMessage(message: string | undefined): string | undefined {
  return message?.replace(/^Value error,\s*/i, "");
}

function formatApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = (detail as FastApiValidationDetail)
      .map((item) => {
        const rawField = item.loc?.filter((part) => part !== "body").join(".");
        const field = rawField ? fieldLabels[rawField] ?? rawField : "";
        const message = cleanValidationMessage(item.msg);
        return field && message ? `${field}: ${message}` : message;
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : fallback;
  }

  return fallback;
}

export function getAdminToken(): string | null {
  return window.localStorage.getItem("ai_lottery_admin_token");
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem("ai_lottery_admin_token", token);
}

const ADMIN_EMAIL_KEY = "ai_lottery_admin_email";
export const getAdminEmail = () => window.localStorage.getItem(ADMIN_EMAIL_KEY);
export const setAdminEmail = (email: string) => window.localStorage.setItem(ADMIN_EMAIL_KEY, email);

export function clearAdminToken(): void {
  window.localStorage.removeItem("ai_lottery_admin_token");
  window.localStorage.removeItem(ADMIN_EMAIL_KEY);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAdminToken();

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const payload = await response.json();
      message = formatApiDetail(payload.detail, message);
    } catch {
      message = response.statusText || message;
    }
    if (response.status === 401 && path !== "/admin/login" && path !== "/admin/logout") {
      clearAdminToken();
      window.dispatchEvent(new CustomEvent("admin-session-expired"));
      message = "Your admin session has expired. Please log in again.";
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function downloadUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function authenticatedDownload(path: string, filename: string): Promise<void> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) throw new ApiError("Download failed.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
