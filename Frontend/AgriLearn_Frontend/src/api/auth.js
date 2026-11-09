// Sign-in client for AgriLearn Kenya.
//
// The session (access token, refresh token, who you are) is kept in localStorage so a
// refresh of the page keeps you signed in. If the browser blocks storage, it is kept in
// memory and lasts until the tab closes.
//
// Farm calls: use authFetch() instead of fetch() in api/farm.js. It adds the
// Authorization header and quietly renews an expired token once before giving up.

const ROOT = (import.meta.env?.VITE_API_URL ?? "http://127.0.0.1:8000/api").replace(/\/$/, "");
const KEY = "agrilearn:session";

export const LOGOUT_EVENT = "agrilearn:logout";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

let session = load();

function save(next) {
  session = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the session lasts until the tab closes */
  }
}

export const getSession = () => session;
export const getActor = () => session?.actor ?? null;
export const isLoggedIn = () => Boolean(session?.access);

export function logout() {
  save(null);
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
}

/* ---------- Errors the screen can show as they are ---------- */
export class ApiError extends Error {
  constructor(message, { status = 0, fields = {} } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

function toApiError(status, data) {
  const detail = typeof data?.detail === "string" ? data.detail : "";

  if (status === 429) {
    const secs = Number(/(\d+)\s*second/i.exec(detail)?.[1]);
    const mins = secs ? Math.max(1, Math.ceil(secs / 60)) : null;
    const wait = mins ? `${mins} minute${mins > 1 ? "s" : ""}` : "a few minutes";
    return new ApiError(
      `Too many tries. Wait ${wait}, then try again. In a class group? Your teacher can reset the password.`,
      { status }
    );
  }
  if (status === 401) {
    const wrong = !detail || /no active account/i.test(detail);
    return new ApiError(
      wrong ? "That username or password is wrong. Check them and try again." : detail,
      { status }
    );
  }
  if (status === 400 && data && typeof data === "object") {
    const fields = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === "detail" || key === "non_field_errors") continue;
      fields[key] = Array.isArray(value) ? value.join(" ") : String(value);
    }
    const general = detail || (Array.isArray(data.non_field_errors) ? data.non_field_errors.join(" ") : "");
    return new ApiError(general || "Some details need fixing.", { status, fields });
  }
  if (status >= 500) {
    return new ApiError("Something went wrong on our side. Try again in a moment.", { status });
  }
  return new ApiError(detail || "That did not work. Try again.", { status });
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${ROOT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok) throw toApiError(res.status, data);
  return data;
}

/* ---------- Log in and sign up ---------- */
export async function login(username, password) {
  const data = await post("/auth/login/", { username: username.trim(), password });
  save({ access: data.access, refresh: data.refresh, actor: data.actor });
  return data.actor;
}

export async function register({ username, password, parentContact, yearOfStudy }) {
  let data;
  try {
    data = await post("/auth/register/", {
      username: username.trim(),
      password,
      parent_contact: parentContact,
      ...(yearOfStudy ? { year_of_study: Number(yearOfStudy) } : {}),
    });
  } catch (err) {
    if (err instanceof ApiError && err.fields) {
      // The server says parent_contact; the form says parentContact
      const f = err.fields;
      if (f.parent_contact) {
        f.parentContact = f.parent_contact;
        delete f.parent_contact;
      }
      if (f.year_of_study) {
        f.yearOfStudy = f.year_of_study;
        delete f.year_of_study;
      }
    }
    throw err;
  }
  save({ access: data.access, refresh: data.refresh, actor: data.actor });
  return data.actor;
}

/* ---------- Authenticated requests ---------- */
let refreshing = null;

// true: renewed. false: the server refused the refresh token. null: could not reach the server.
function refreshAccess() {
  if (!session?.refresh) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${ROOT}/auth/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: session.refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        save({ ...session, access: data.access, refresh: data.refresh ?? session.refresh });
        return true;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function authFetch(input, init = {}) {
  const send = () => {
    const headers = new Headers(init.headers);
    if (session?.access) headers.set("Authorization", `Bearer ${session.access}`);
    return fetch(input, { ...init, headers });
  };

  const res = await send();
  if (res.status !== 401 || !session?.refresh) return res;

  const renewed = await refreshAccess();
  if (renewed === true) return send();
  if (renewed === false) logout(); // an offline student stays signed in
  return res;
}