import { authFetch } from "./auth";

const BASE_URL = "http://127.0.0.1:8000/api/farm";

async function handle(res) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (typeof data?.error === "string") throw new Error(data.error);
      if (typeof data?.detail === "string") throw new Error(data.detail);
      const first = Object.values(data || {})[0];
      if (Array.isArray(first) && first[0]) throw new Error(String(first[0]));
      if (typeof first === "string") throw new Error(first);
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
    }
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const createCycle = (data) =>
  authFetch(`${BASE_URL}/cycles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);

export const getCycleState = (cycleId) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/`).then(handle);

export const getAvailableActions = (cycleId) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/available-actions/`).then(handle);

export const submitAction = (cycleId, data) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/actions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);

export function toActionList(data) {
  if (Array.isArray(data)) return data;
  return data.actions ?? data.available_actions ?? data.stages ?? [];
}

export const stageId = (a) => a.stage_id ?? a.id ?? a.stage?.id;
export const stageName = (a) =>
  a.name ?? a.stage_name ?? a.stage?.name ?? a.action_type ?? `Stage ${stageId(a)}`;
export const stageType = (a) => a.action_type ?? a.stage?.action_type;
export const stageEnabled = (a) => a.enabled !== false;

export const cycleHealth = (c) => {
  const h = Number(c?.current_health_score);
  return Number.isFinite(h) ? h : null;
};
export const cycleHealthState = (c) => c?.current_health_state ?? null;
export const cycleDay = (c) => c?.virtual_day ?? null;
export const cycleState = (c) => c?.status ?? null;
export const getDebrief = (cycleId) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/debrief/`).then(handle);
export const pauseCycle = (cycleId) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/pause/`, { method: "POST" }).then(handle);

export const resumeCycle = (cycleId) =>
  authFetch(`${BASE_URL}/cycles/${cycleId}/resume/`, { method: "POST" }).then(handle);
export const isPaused = (c) =>
  Boolean(c?.is_paused) && String(c?.status ?? "").toLowerCase() === "active";