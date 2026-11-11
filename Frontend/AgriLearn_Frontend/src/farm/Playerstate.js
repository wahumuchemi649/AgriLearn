import { create } from "zustand";

// Mutable per-frame state for the walking character (read by Player, camera, HUD).
export const player = {
  x: -0.5,
  z: 4.0,
  heading: Math.PI, // 0 = facing +z
  speed: 0,
  running: false,
  camYaw: Math.PI / 4, // camera sits at player + (sin, cos) * distance
  camDist: 8.5,
  workT: 0, // > 0 while the character is doing a job
  tool: "hand",
};

// Raw input from keyboard and on-screen joystick
export const input = {
  keys: new Set(),
  joy: { x: 0, y: 0 },
  joyActive: false,
};

// Island limits and solid things the player cannot walk through
export const BOUNDS = { x: 6.7, z: 4.6 };
export const OBSTACLES = [
  { x: 5.05, z: -3.2, r: 1.1 }, // barn
  { x: -5.7, z: -3.6, r: 0.35 }, // trees
  { x: 5.9, z: 2.8, r: 0.3 },
  { x: -5.8, z: 3.5, r: 0.25 },
];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let savedRequired = true;
try {
  savedRequired = localStorage.getItem("agrilearn:walkRequired") !== "0";
} catch {
  /* ignore */
}

// Small UI-facing store: which work area the player is standing in, etc.
export const useWalkStore = create((set) => ({
  nearId: null,
  targetId: null,
  pulse: 0,
  required: savedRequired,
  setNear: (nearId) => set({ nearId }),
  setTarget: (targetId) => set({ targetId }),
  ping: () => set({ pulse: Date.now() }),
  setRequired: (required) => {
    try {
      localStorage.setItem("agrilearn:walkRequired", required ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ required });
  },
}));