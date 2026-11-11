import { useMemo } from "react";
import { useFarmStore } from "./useFarmStore";
import { stageName, cycleState } from "../api/farm";

// The whole journey, in order. Each entry matches stage names from the engine.
export const JOURNEY = [
  { key: "bush", icon: "🪓", label: "Clear bush", re: /bush|clear/ },
  { key: "primary", icon: "⛏️", label: "Primary tillage", re: /primary/ },
  { key: "secondary", icon: "🟫", label: "Secondary tillage", re: /secondary/ },
  { key: "mark", icon: "📏", label: "Mark the land", re: /spacing|mark|peg|layout/ },
  { key: "plant", icon: "🌱", label: "Planting", re: /plant|sow/ },
  { key: "fertil", icon: "🧪", label: "Fertilizer", re: /fertili|manure/ },
  { key: "weed", icon: "🧹", label: "Weeding", re: /weed/ },
  { key: "harvest", icon: "🧺", label: "Harvest", re: /harvest/ },
  { key: "shell", icon: "🌽", label: "Shelling", re: /shell|thresh/ },
  { key: "dry", icon: "☀️", label: "Drying", re: /dry/ },
  { key: "store", icon: "📦", label: "Storage", re: /stor|bag|pack|sale|market/ },
];

// The API only returns remaining stages, so we remember which ones we have seen.
let seenFor = "";
const seen = new Set();

/**
 * done[key]    -> the stage is finished
 * pending[key] -> the stage is still waiting to be done
 * A stage counts as done when it was seen and is now gone, or when a later
 * stage is already pending, or when the whole cycle has finished.
 */
export function useStageFlags() {
  const loaded = useFarmStore((s) => s.loaded);
  const actions = useFarmStore((s) => s.actions);
  const cycle = useFarmStore((s) => s.cycle);

  return useMemo(() => {
    const cid = String(cycle?.id ?? cycle?.cycle_id ?? "");
    if (cid !== seenFor) {
      seenFor = cid;
      seen.clear();
    }
    const names = actions.map((a) => String(stageName(a)).toLowerCase());
    const pendingArr = JOURNEY.map((j) => names.some((n) => j.re.test(n)));
    pendingArr.forEach((p, i) => p && seen.add(JOURNEY[i].key));

    const st = String(cycleState(cycle) ?? "").toLowerCase();
    const finished = Boolean(cycle) && st !== "" && !["active", "paused"].includes(st);

    const done = {};
    const pending = {};
    JOURNEY.forEach((j, i) => {
      pending[j.key] = pendingArr[i];
      done[j.key] =
        loaded &&
        !pendingArr[i] &&
        (seen.has(j.key) || pendingArr.slice(i + 1).some(Boolean) || finished);
    });
    return { loaded, finished, done, pending };
  }, [loaded, actions, cycle]);
}