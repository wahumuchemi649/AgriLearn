const BASE_URL = "http://127.0.0.1:8000/api/farm";

async function handle(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const createCycle = (data) =>
  fetch(`${BASE_URL}/cycles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);

export const getCycleState = (cycleId) =>
  fetch(`${BASE_URL}/cycles/${cycleId}/`).then(handle);

export const getAvailableActions = (cycleId) =>
  fetch(`${BASE_URL}/cycles/${cycleId}/available-actions/`).then(handle);

export const submitAction = (cycleId, data) =>
  fetch(`${BASE_URL}/cycles/${cycleId}/actions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);

// ---- The only place that guesses your response shapes ----
// Adjust these once you've seen the real JSON.

// available-actions may return a bare list or wrap it in a key
export function toActionList(data) {
  if (Array.isArray(data)) return data;
  return data.actions ?? data.available_actions ?? [];
}

// An action may be a string ("water") or an object
export function actionKey(a) {
  return typeof a === "string" ? a : a.action_type ?? a.type ?? a.name ?? a.id;
}
export function actionLabel(a) {
  return typeof a === "string" ? a : a.label ?? a.name ?? actionKey(a);
}

// What we send to POST /actions/
export function actionPayload(a) {
  return { action_type: actionKey(a) };
}