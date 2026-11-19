const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("p06_token");
}

export function setToken(token) {
  if (typeof window !== "undefined") localStorage.setItem("p06_token", token);
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem("p06_token");
}

// Turn the API's { error: { message, details } } shape into one readable sentence.
function errorMessage(data, status) {
  const err = data?.error;
  if (!err) return `Request failed (${status})`;
  let msg = err.message || `Request failed (${status})`;
  const d = err.details;
  if (d?.missing?.length) msg += `: ${d.missing.join(", ")}`;
  else if (d?.fieldErrors) {
    const first = Object.entries(d.fieldErrors)[0];
    if (first) msg = first[1][0];
  } else if (d && typeof d === "object") {
    const first = Object.values(d).find((v) => v?.message);
    if (first) msg = first.message; // mongoose validation errors
  }
  return msg;
}

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data;
}

// Authenticated download (a plain <a href> cannot send the Authorization header).
export async function apiDownload(path, filename, { method = "GET", body } = {}) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// multipart upload (do NOT set Content-Type: the browser adds the boundary itself)
export async function apiUpload(path, formData) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data;
}

// One click -> the PDF opens in a new tab. A plain <a href> cannot send the login token, so the file
// is fetched with it and shown from a temporary blob: URL. The tab is opened synchronously inside the
// click so pop-up blockers allow it, then pointed at the PDF once it has downloaded.
export async function apiOpenFile(path) {
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  try {
    tab.document.title = "Loading certificate…";
    tab.document.body.textContent = "Loading certificate…";
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(errorMessage(data, res.status));
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    tab.close();
    throw err;
  }
}
