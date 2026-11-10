import { authFetch } from "./auth"; // the file you just pasted

const BASE = "http://127.0.0.1:8000/api/tutor";

async function req(path, options = {}) {
  const res = await authFetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      res.status === 429
        ? "You're asking too fast. Wait a moment and try again."
        : data.detail || "Something went wrong.";
    throw new Error(msg);
  }
  return data;
}

export const askTutor = (cycleId, question) =>
  req("/ask/", {
    method: "POST",
    body: JSON.stringify({
      question,
      ...(cycleId ? { cycle_id: cycleId } : {}), // no cycle = general chat
    }),
  });

export const getHistory = (cycleId) =>
  req(cycleId ? `/history/${cycleId}/` : "/history/");