import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Base paths in public/models/ so you can drop any downloaded Quaternius / Kenney / Poly Haven
// CC0 .glb or .gltf files into Frontend/AgriLearn_Frontend/public/models/ and they will load automatically.
export const TREE_GLTF_URLS = {
  acacia: "/models/acacia.glb",
  eucalyptus: "/models/eucalyptus.glb",
  banana: "/models/banana.glb",
};

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Merges an array of non-indexed or indexed BufferGeometries into one single BufferGeometry
// with per-vertex colors so an entire tree's bark or foliage can be rendered in 1 InstancedMesh.
function mergeGeometriesWithColors(parts) {
  const positions = [];
  const normals = [];
  const colors = [];

  parts.forEach(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const vCol = g.attributes.color;
    const baseC = new THREE.Color(color || "#ffffff");

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      if (vCol) {
        colors.push(vCol.getX(i) * baseC.r, vCol.getY(i) * baseC.g, vCol.getZ(i) * baseC.b);
      } else {
        colors.push(baseC.r, baseC.g, baseC.b);
      }
    }
  });

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

// Displaces a low-poly icosahedron with vertical sunlight shading for organic Quaternius-style foliage clusters
function makeFoliageCluster(radius, { sx = 1, sy = 1, sz = 1, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, seed = 1, botHex = "#8aa882", topHex = "#ffffff" }) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n = 1 + (Math.sin(vx * 3.5 + vy * 2.9 + seed * 11) + Math.cos(vz * 4.1 - vy * 3.3 + seed * 23)) * 0.1;
    const fx = vx * n * sx;
    const fy = vy * n * sy;
    const fz = vz * n * sz;
    pos.setXYZ(i, fx, fy, fz);
    if (fy < minY) minY = fy;
    if (fy > maxY) maxY = fy;
  }

  const span = Math.max(0.001, maxY - minY);
  const cArr = new Float32Array(pos.count * 3);
  const bot = new THREE.Color(botHex);
  const top = new THREE.Color(topHex);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    tmp.copy(bot).lerp(top, Math.pow(t, 0.75));
    cArr[i * 3] = tmp.r;
    cArr[i * 3 + 1] = tmp.g;
    cArr[i * 3 + 2] = tmp.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cArr, 3));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function makeBranchSegment(rTop, rBot, len, { tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, radial = 6 }) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, radial);
  g.translate(0, len / 2, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/* --------------------------------------------------------------------------
   1. Kenyan Umbrella Thorn Acacia (Vachellia tortilis)
      Forked spreading trunk & branches + wide, tiered flat-topped canopy pads
   -------------------------------------------------------------------------- */
function buildAcaciaArchetype() {
  const barkParts = [
    // Slightly curved lower trunk
    { geo: makeBranchSegment(0.11, 0.19, 0.72, { tx: 0, ty: 0, tz: 0, rx: 0.05, rz: -0.04, radial: 7 }), color: "#6e472b" },
    // 4 wide spreading primary boughs reaching out to support the umbrella pads
    { geo: makeBranchSegment(0.055, 0.1, 0.82, { tx: -0.02, ty: 0.65, tz: 0.02, rx: 0.48, ry: 0.2, rz: 0.52 }), color: "#784e30" },
    { geo: makeBranchSegment(0.05, 0.095, 0.78, { tx: -0.02, ty: 0.66, tz: 0.02, rx: -0.52, ry: 1.8, rz: -0.44 }), color: "#784e30" },
    { geo: makeBranchSegment(0.048, 0.09, 0.74, { tx: -0.02, ty: 0.68, tz: 0.02, rx: 0.42, ry: 3.6, rz: -0.5 }), color: "#734a2d" },
    { geo: makeBranchSegment(0.042, 0.075, 0.65, { tx: 0.08, ty: 0.85, tz: -0.06, rx: -0.28, ry: 5.0, rz: 0.35 }), color: "#7c5233" },
  ];

  const foliageParts = [
    // Main upper umbrella table
    { geo: makeFoliageCluster(0.68, { sx: 1.75, sy: 0.24, sz: 1.65, tx: -0.05, ty: 1.48, tz: 0.04, seed: 3 }), color: "#5aa636" },
    // Lower right flat shelf
    { geo: makeFoliageCluster(0.54, { sx: 1.55, sy: 0.22, sz: 1.45, tx: -0.48, ty: 1.26, tz: 0.36, seed: 11 }), color: "#4e962f" },
    // Mid left flat shelf
    { geo: makeFoliageCluster(0.56, { sx: 1.6, sy: 0.23, sz: 1.5, tx: 0.44, ty: 1.34, tz: -0.34, seed: 19 }), color: "#64b23c" },
    // Top crown pad
    { geo: makeFoliageCluster(0.46, { sx: 1.45, sy: 0.2, sz: 1.4, tx: 0.14, ty: 1.64, tz: 0.18, seed: 29 }), color: "#6ec043" },
  ];

  return {
    barkGeo: mergeGeometriesWithColors(barkParts),
    foliageGeo: mergeGeometriesWithColors(foliageParts),
  };
}

/* --------------------------------------------------------------------------
   2. Kenyan Blue Gum / Eucalyptus (Eucalyptus saligna / globulus)
      Tall, slender pale silvery-cream trunk with high tiered drooping canopy
   -------------------------------------------------------------------------- */
function buildEucalyptusArchetype() {
  const barkParts = [
    // Tall slender lower pale trunk
    { geo: makeBranchSegment(0.085, 0.14, 1.25, { tx: 0, ty: 0, tz: 0, rx: 0.03, rz: 0.02, radial: 7 }), color: "#b8afa0" },
    // Upper main stem
    { geo: makeBranchSegment(0.05, 0.085, 1.05, { tx: 0.02, ty: 1.22, tz: 0.03, rx: -0.04, rz: 0.03, radial: 6 }), color: "#c7bfb0" },
    // High angled side branches
    { geo: makeBranchSegment(0.028, 0.048, 0.52, { tx: 0.03, ty: 1.38, tz: 0.02, rx: 0.42, rz: 0.38 }), color: "#aba090" },
    { geo: makeBranchSegment(0.028, 0.045, 0.48, { tx: 0.02, ty: 1.68, tz: 0.01, rx: -0.38, rz: -0.42 }), color: "#b5ab9b" },
  ];

  // Sage / blue-green eucalyptus foliage clusters along the upper half
  const foliageParts = [
    { geo: makeFoliageCluster(0.44, { sx: 0.95, sy: 0.78, sz: 0.95, tx: -0.26, ty: 1.58, tz: 0.2, seed: 41 }), color: "#3d8754" },
    { geo: makeFoliageCluster(0.46, { sx: 1.0, sy: 0.82, sz: 0.95, tx: 0.25, ty: 1.82, tz: -0.18, seed: 53 }), color: "#45945d" },
    { geo: makeFoliageCluster(0.5, { sx: 0.92, sy: 0.9, sz: 0.92, tx: -0.06, ty: 2.12, tz: 0.06, seed: 67 }), color: "#4da166" },
    { geo: makeFoliageCluster(0.38, { sx: 0.85, sy: 0.95, sz: 0.85, tx: 0.04, ty: 2.48, tz: -0.02, seed: 79 }), color: "#58b072" },
  ];

  return {
    barkGeo: mergeGeometriesWithColors(barkParts),
    foliageGeo: mergeGeometriesWithColors(foliageParts),
  };
}

/* --------------------------------------------------------------------------
   3. Kenyan Banana Plant (Musa acuminata — "Ndizi")
       Fibrous pseudostem + sucker + rosette of 8 broad arching banana fronds
   -------------------------------------------------------------------------- */
function makeBananaFrondGeo({ yaw = 0, pitch = 0.35, length = 1.15, width = 0.34, droop = 0.42, tilt = 0 }) {
  const segs = 7;
  const pos = [];
  const col = [];
  const idx = [];

  const baseCol = new THREE.Color("#4f9e28");
  const midCol = new THREE.Color("#6ec838");
  const tipCol = new THREE.Color("#88dc46");
  const tmp = new THREE.Color();

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt));
  const v = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    // Petiole stem transitions into a wide oblong paddle leaf with a V-fold midrib
    const w = u < 0.15 ? width * 0.16 : width * Math.sin(Math.PI * Math.pow((u - 0.1) / 0.9, 0.72));
    const r = u * length;
    const h = 0.92 + r * Math.sin(pitch) - droop * u * u * length;
    const fold = 0.028 * (1 - u * 0.5);

    tmp.copy(baseCol).lerp(midCol, Math.min(1, u * 1.5)).lerp(tipCol, Math.max(0, u - 0.5) * 2);

    const pts = [
      [r, h - fold, -w * 0.5],
      [r, h + fold, 0],
      [r, h - fold, w * 0.5],
    ];
    pts.forEach(([px, py, pz]) => {
      v.set(px, py, pz).applyQuaternion(q);
      pos.push(v.x, v.y, v.z);
      col.push(tmp.r, tmp.g, tmp.b);
    });
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(
      a, b, a + 1,
      a + 1, b, b + 1,
      a + 1, b + 1, a + 2,
      a + 2, b + 1, b + 2
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function buildBananaArchetype() {
  const barkParts = [
    // Main banana pseudostem (greenish-brown layered sheath)
    { geo: makeBranchSegment(0.095, 0.15, 0.98, { tx: 0, ty: 0, tz: 0, rx: 0.03, radial: 8 }), color: "#6d7838" },
    // Smaller young banana sucker beside the mother plant
    { geo: makeBranchSegment(0.05, 0.08, 0.52, { tx: 0.24, ty: 0, tz: 0.14, rx: 0.08, rz: -0.1, radial: 6 }), color: "#78853e" },
  ];

  const foliageParts = [];
  // 7 broad arching mature fronds radiating from the crown
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const ring = i < 4 ? 0 : 1; // lower older leaves droop more; upper young leaves point higher
    const yaw = (i / frondCount) * Math.PI * 2 + (ring ? 0.35 : 0);
    const pitch = ring === 0 ? 0.38 : 0.68;
    const droop = ring === 0 ? 0.48 : 0.32;
    const length = ring === 0 ? 1.12 : 0.96;
    const width = ring === 0 ? 0.34 : 0.28;
    foliageParts.push({
      geo: makeBananaFrondGeo({ yaw, pitch, length, width, droop }),
      color: ring === 0 ? "#5cb832" : "#72ce3e",
    });
  }

  // 3 small fronds on the young sucker
  for (let k = 0; k < 3; k++) {
    const g = makeBananaFrondGeo({
      yaw: k * 2.1 + 0.5,
      pitch: 0.55,
      length: 0.55,
      width: 0.18,
      droop: 0.25,
    });
    g.translate(0.24, -0.42, 0.14);
    foliageParts.push({ geo: g, color: "#6ec83b" });
  }

  return {
    barkGeo: mergeGeometriesWithColors(barkParts),
    foliageGeo: mergeGeometriesWithColors(foliageParts),
  };
}

let cachedDefaultArchetypes = null;

export function getDefaultTreeArchetypes() {
  if (!cachedDefaultArchetypes) {
    cachedDefaultArchetypes = {
      acacia: buildAcaciaArchetype(),
      eucalyptus: buildEucalyptusArchetype(),
      banana: buildBananaArchetype(),
    };
  }
  return cachedDefaultArchetypes;
}

// Extracts bark & foliage geometries from a loaded GLTF scene so any external .glb file
// dropped into /public/models/{acacia,eucalyptus,banana}.glb can be instanced automatically.
function extractArchetypeFromGltf(gltf) {
  const barkParts = [];
  const foliageParts = [];

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const g = node.geometry.clone();
    g.applyMatrix4(node.matrixWorld);

    const matName = (node.material?.name || node.name || "").toLowerCase();
    const c = node.material?.color ? `#${node.material.color.getHexString()}` : "#ffffff";
    const isBark =
      matName.includes("trunk") ||
      matName.includes("bark") ||
      matName.includes("wood") ||
      matName.includes("stem") ||
      (node.material?.color && node.material.color.r > node.material.color.g * 1.05);

    if (isBark) {
      barkParts.push({ geo: g, color: c });
    } else {
      foliageParts.push({ geo: g, color: c });
    }
  });

  if (!barkParts.length && !foliageParts.length) return null;
  return {
    barkGeo: barkParts.length ? mergeGeometriesWithColors(barkParts) : new THREE.BufferGeometry(),
    foliageGeo: foliageParts.length ? mergeGeometriesWithColors(foliageParts) : new THREE.BufferGeometry(),
  };
}

// Attempts to load optional external CC0 .glb models via GLTFLoader if placed in public/models/.
// Silently falls back to the built-in Kenyan Acacia, Eucalyptus, and Banana archetypes when offline or absent.
export async function loadOptionalGltfTreeArchetypes() {
  const loader = new GLTFLoader();
  const loaded = {};

  await Promise.all(
    Object.entries(TREE_GLTF_URLS).map(async ([species, url]) => {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const contentType = head.headers.get("content-type") || "";
        // Vite dev server returns text/html for missing files (SPA fallback); skip if not a binary/model
        if (!head.ok || contentType.includes("text/html")) return;
        const gltf = await loader.loadAsync(url);
        const extracted = extractArchetypeFromGltf(gltf);
        if (extracted) loaded[species] = extracted;
      } catch {
        /* model file not in public/models/, keep built-in archetype */
      }
    })
  );

  return Object.keys(loaded).length ? loaded : null;
}
