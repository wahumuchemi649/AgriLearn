import { create } from "zustand";
import {
  getCycleState,
  getAvailableActions,
  submitAction,
  toActionList,
  actionPayload,
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

export const useFarmStore = create((set, get) => ({
  plots: createPlots(),
  selectedPlotId: null,

  cycleId: null,
  cycle: null,
  actions: [],
  loading: false,
  busy: false,
  error: null,

  selectPlot: (id) =>
    set((s) => ({ selectedPlotId: s.selectedPlotId === id ? null : id })),
  clearSelection: () => set({ selectedPlotId: null }),

  loadCycle: async (cycleId) => {
    set({ cycleId, loading: true, error: null });
    try {
      const [cycle, actions] = await Promise.all([
        getCycleState(cycleId),
        getAvailableActions(cycleId),
      ]);
      console.log("cycle state:", cycle);
      console.log("available actions:", actions);
      set({ cycle, actions: toActionList(actions), loading: false });
    } catch (e) {
      set({ loading: false, error: e.message });
    }
  },

  performAction: async (action) => {
    const { cycleId, busy } = get();
    if (busy || !cycleId) return;
    set({ busy: true, error: null });
    try {
      const result = await submitAction(cycleId, actionPayload(action));
      console.log("action result:", result);
      // Re-read from the server: it is the source of truth
      const [cycle, actions] = await Promise.all([
        getCycleState(cycleId),
        getAvailableActions(cycleId),
      ]);
      set({ cycle, actions: toActionList(actions), busy: false });
    } catch (e) {
      set({ busy: false, error: e.message });
    }
  },
}));