import { create } from "zustand";
import {
  getCycleState,
  getAvailableActions,
  submitAction,
  toActionList,
  stageId,
  stageName,
} from "../api/farm";

export const GRID_SIZE = 4;
export const PLOT_SIZE = 1.6;
export const PLOT_GAP = 0.2;

function createPlots() {
  const step = PLOT_SIZE + PLOT_GAP;
  const offset = ((GRID_SIZE - 1) * step) / 2;
  const list = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      list.push({
        id: row * GRID_SIZE + col,
        position: [col * step - offset, 0.1, row * step - offset],
      });
    }
  }
  return list;
}

// The planting day is remembered in this browser so growth survives a refresh.
const plantedKey = (id) => `agrilearn:plantedDay:${id}`;
function readPlantedDay(id) {
  try {
    const v = localStorage.getItem(plantedKey(id));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function savePlantedDay(id, day) {
  try {
    localStorage.setItem(plantedKey(id), String(day));
  } catch {
    /* storage unavailable, ignore */
  }
}

export const useFarmStore = create((set, get) => ({
  plots: createPlots(),
  selectedPlotId: null,

  cycleId: null,
  cycle: null,
  actions: [],
  loaded: false,
  loading: false,
  busy: false,
  error: null,
  plantedDay: null,
  lastEvent: null, // { name, t } drives the particle burst and the toast

  selectPlot: (id) =>
    set((s) => ({ selectedPlotId: s.selectedPlotId === id ? null : id })),
  clearSelection: () => set({ selectedPlotId: null }),

  setPlantedDay: (day) => {
    const { cycleId } = get();
    if (cycleId) savePlantedDay(cycleId, day);
    set({ plantedDay: day });
  },

  loadCycle: async (cycleId) => {
    set({
      cycleId,
      loading: true,
      loaded: false,
      error: null,
      lastEvent: null,
      plantedDay: readPlantedDay(cycleId),
    });
    try {
      const [cycle, actions] = await Promise.all([
        getCycleState(cycleId),
        getAvailableActions(cycleId),
      ]);
      set({ cycle, actions: toActionList(actions), loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, error: e.message });
    }
  },

  // Light poll: virtual_day and health change on their own as time passes
  refreshCycle: async () => {
    const { cycleId, busy } = get();
    if (!cycleId || busy) return;
    try {
      const cycle = await getCycleState(cycleId);
      if (get().cycleId === cycleId) set({ cycle });
    } catch {
      /* ignore transient errors */
    }
  },

  performAction: async (stage, extras = {}) => {
    const { cycleId, busy } = get();
    if (busy || !cycleId) return;
    set({ busy: true, error: null });
    try {
      const name = String(stageName(stage));
      await submitAction(cycleId, { stage_id: stageId(stage), ...extras });
      const [cycle, actions] = await Promise.all([
        getCycleState(cycleId),
        getAvailableActions(cycleId),
      ]);
      const updates = {
        cycle,
        actions: toActionList(actions),
        busy: false,
        lastEvent: { name, t: Date.now() },
      };
      if (name.toLowerCase().includes("planting")) {
        const day = Number(cycle.virtual_day);
        if (Number.isFinite(day)) {
          updates.plantedDay = day;
          savePlantedDay(cycleId, day);
        }
      }
      set(updates);
    } catch (e) {
      set({ busy: false, error: e.message });
    }
  },
}));