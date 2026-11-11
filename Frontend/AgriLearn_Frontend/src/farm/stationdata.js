import { PLOT_SIZE } from "./useFarmStore";

// Work areas on the farm. Each stage of the cycle happens in one of them.
export const STATION_INFO = {
  field: { label: "Maize field", icon: "🌽" },
  barn: { label: "Barn", icon: "🏚️" },
  yard: { label: "Drying yard", icon: "☀️" },
};

// Which work area a stage belongs to (matched on the stage name)
export function stationIdForName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/shell|thresh|bag|stor|pack|market|sell|winnow|grading/.test(n)) return "barn";
  if (/dry|sun/.test(n)) return "yard";
  return "field";
}

// Which tool the character holds while doing the stage
export function toolForName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/bush|clear|primary|secondary|cultivat|till|furrow|weed|hoe/.test(n)) return "blade";
  if (/plant|sow|seed|fertili|manure|spray/.test(n)) return "bag";
  if (/harvest|shell|thresh|dry|stor|bag|pack/.test(n)) return "basket";
  return "hand";
}

// Field area follows wherever the plots really are
export function getStations(plots) {
  let minX = -3.6, maxX = 3.6, minZ = -2.7, maxZ = 2.7;
  if (plots && plots.length) {
    minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
    for (const p of plots) {
      minX = Math.min(minX, p.position[0]);
      maxX = Math.max(maxX, p.position[0]);
      minZ = Math.min(minZ, p.position[2]);
      maxZ = Math.max(maxZ, p.position[2]);
    }
    const pad = PLOT_SIZE / 2 + 0.9;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  }
  return [
    { id: "field", kind: "rect", minX, maxX, minZ, maxZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    { id: "barn", kind: "circle", x: 4.9, z: -2.0, r: 1.5 },
    { id: "yard", kind: "circle", x: 6.0, z: 0.9, r: 1.6 },
  ];
}

export function inside(st, x, z) {
  if (st.kind === "rect") return x >= st.minX && x <= st.maxX && z >= st.minZ && z <= st.maxZ;
  return Math.hypot(x - st.x, z - st.z) <= st.r;
}

// Distance from a point to the edge of a station (0 when inside)
export function distanceTo(st, x, z) {
  if (st.kind === "rect") {
    const dx = Math.max(st.minX - x, 0, x - st.maxX);
    const dz = Math.max(st.minZ - z, 0, z - st.maxZ);
    return Math.hypot(dx, dz);
  }
  return Math.max(0, Math.hypot(x - st.x, z - st.z) - st.r);
}