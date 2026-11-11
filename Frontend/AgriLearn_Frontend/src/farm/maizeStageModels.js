import * as THREE from "three";

/* -------------------------------------------------------------------------
   Instanced Maize Growth Stage Models:
   1. Seedling      (V2–V3 sprout, earth mound, rolled central funnel, 3 small blades)
   2. Vegetative    (Knee-high V6–V8 whorl, segmented stalk, brace roots, 7 arched leaves)
   3. Tasseling     (Full stalk, 9 leaves, multi-branch pollen tassel, 2 husked ears + silks)
   4. Mature        (Harvest-ready stalk, senescing leaves, peeled husks + golden kernel cobs)

   Each stage returns { foliageGeo, accentGeo }:
   - foliageGeo: stalk + leaf blades with vertex-color shading (midrib & vertical AO),
                 tinted dynamically by plant health & ripeness via instanceColor.
   - accentGeo:  mound / whorl / tassel / husks / kernels / silks with baked vertex colors,
                 rendered in a companion InstancedMesh so all 64 plants take just 2 draw calls
                 for their active stage.
   ------------------------------------------------------------------------- */

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Paint vertex colors with a bottom-to-top sunlight gradient
function paintGradient(geo, bottomHex, topHex) {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  nonIndexed.computeVertexNormals();
  const pos = nonIndexed.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(0.001, maxY - minY);
  const cBot = new THREE.Color(bottomHex);
  const cTop = new THREE.Color(topHex);
  const cTmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    cTmp.copy(cBot).lerp(cTop, t);
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return nonIndexed;
}

// Merge an array of non-indexed BufferGeometries with position, normal, color
function mergeColoredGeos(geos) {
  let totalVerts = 0;
  const prepared = geos.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    totalVerts += ni.attributes.position.count;
    return ni;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (const g of prepared) {
    const pos = g.attributes.position.array;
    const norm = g.attributes.normal.array;
    const col = g.attributes.color?.array;
    positions.set(pos, offset);
    normals.set(norm, offset);
    if (col) {
      colors.set(col, offset);
    } else {
      colors.fill(1, offset, offset + pos.length);
    }
    offset += pos.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return merged;
}

// Build a curved, V-folded maize leaf ribbon with a lighter central midrib
function buildMaizeLeaf({
  length = 0.55,
  width = 0.085,
  archHeight = 0.24,
  droop = 0.52,
  fold = 0.014,
  waveAmp = 0.006,
  baseY = 0.3,
  stalkRadius = 0.03,
  yaw = 0,
  tilt = 0.45,
  baseBrightness = 0.82,
  tipBrightness = 1.06,
}) {
  const segs = 9;
  const pos = [];
  const col = [];
  const idx = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    // Broad in the middle, tapering to sheath at base and pointed tip
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.14 + u * 0.86)), 0.68);
    const x = u * length;
    const y = length * (archHeight * u - droop * u * u);
    const ripple = Math.sin(u * Math.PI * 3.5) * waveAmp * u;

    // Left margin, raised pale-tinted midrib, right margin
    pos.push(
      x, y + ripple, -w / 2,
      x, y + fold, 0,
      x, y - ripple, w / 2
    );

    const shade = baseBrightness + (tipBrightness - baseBrightness) * u;
    const midrib = Math.min(1.18, shade * 1.12);
    // Neutral grayscale/greenish vertex color so instanceColor controls health/ripeness tint
    col.push(
      shade * 0.92, shade, shade * 0.88,
      midrib, midrib * 1.03, midrib * 0.92,
      shade * 0.92, shade, shade * 0.88
    );
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

  const nonIndexed = g.toNonIndexed();
  nonIndexed.computeVertexNormals();

  // Transform from local leaf space to stalk attachment point
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt, "YXZ"));
  const attachX = Math.cos(yaw) * stalkRadius;
  const attachZ = -Math.sin(yaw) * stalkRadius;
  m.compose(new THREE.Vector3(attachX, baseY, attachZ), q, new THREE.Vector3(1, 1, 1));
  nonIndexed.applyMatrix4(m);
  return nonIndexed;
}

// Build a segmented maize stalk with nodal rings
function buildSegmentedStalk(height, bottomRadius, topRadius, nodes = 4, bottomShade = 0.72, topShade = 0.96) {
  const parts = [];
  const main = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8, nodes, false);
  main.translate(0, height / 2, 0);
  const cBot = new THREE.Color().setScalar(bottomShade);
  const cTop = new THREE.Color().setScalar(topShade);
  parts.push(paintGradient(main, cBot, cTop));

  // Subtle internode rings
  for (let i = 1; i < nodes; i++) {
    const t = i / nodes;
    const r = THREE.MathUtils.lerp(bottomRadius, topRadius, t) * 1.12;
    const ring = new THREE.CylinderGeometry(r * 0.96, r, 0.018, 8);
    ring.translate(0, height * t, 0);
    parts.push(paintGradient(ring, "#c8d6be", "#dce8d2"));
  }
  return parts;
}

/* =========================================================================
   STAGE 1: SEEDLING (Days 0–30, V2–V3 stage)
   Short tender shoot, central tightly rolled funnel leaf, 3 perky young blades,
   and a loosened dark soil mound at the base.
   ========================================================================= */
function buildSeedlingStage() {
  const foliageParts = [];
  const accentParts = [];

  const stalkH = 0.26;
  foliageParts.push(...buildSegmentedStalk(stalkH, 0.024, 0.016, 2, 0.78, 1.0));

  // Central upright rolled whorl cone (funnel leaf)
  const funnel = new THREE.ConeGeometry(0.022, 0.16, 7, 1, true);
  funnel.scale(1, 1, 0.75);
  funnel.translate(0, stalkH + 0.06, 0);
  foliageParts.push(paintGradient(funnel, "#d8f0d0", "#ffffff"));

  // 3 small perky seedling blades
  const blades = [
    { y: 0.09, len: 0.22, w: 0.048, yaw: 0.3, tilt: 0.62, arch: 0.32, droop: 0.35 },
    { y: 0.16, len: 0.28, w: 0.056, yaw: 2.4, tilt: 0.58, arch: 0.3, droop: 0.38 },
    { y: 0.23, len: 0.25, w: 0.052, yaw: 4.5, tilt: 0.68, arch: 0.34, droop: 0.32 },
  ];
  blades.forEach((b, idx) => {
    foliageParts.push(
      buildMaizeLeaf({
        length: b.len,
        width: b.w,
        archHeight: b.arch,
        droop: b.droop,
        fold: 0.009,
        baseY: b.y,
        stalkRadius: 0.016,
        yaw: b.yaw,
        tilt: b.tilt,
        baseBrightness: 0.85,
        tipBrightness: 1.08 - idx * 0.02,
      })
    );
  });

  // Accent: dark moist soil emergence mound around the base
  const mound = new THREE.SphereGeometry(0.135, 10, 6);
  mound.scale(1, 0.36, 1);
  mound.translate(0, 0.02, 0);
  accentParts.push(paintGradient(mound, "#4a2c15", "#6e4423"));

  return {
    foliageGeo: mergeColoredGeos(foliageParts),
    accentGeo: mergeColoredGeos(accentParts),
  };
}

/* =========================================================================
   STAGE 2: VEGETATIVE / KNEE-HIGH WHORL (Days 30–70, V6–V8 stage)
   Sturdy segmented stalk (~0.88m), prop/brace roots, 7 wide arching leaves
   in an alternating spiral, and a deep-green central whorl funnel.
   ========================================================================= */
function buildVegetativeStage() {
  const foliageParts = [];
  const accentParts = [];

  const stalkH = 0.86;
  foliageParts.push(...buildSegmentedStalk(stalkH, 0.042, 0.026, 5, 0.74, 0.98));

  // 7 broad vegetative leaves spiraling up the stalk
  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const len = 0.36 + Math.sin(Math.PI * (0.18 + t * 0.72)) * 0.26;
    const w = 0.068 + Math.sin(Math.PI * t) * 0.028;
    const y = 0.14 + t * (stalkH - 0.16);
    const yaw = i * 2.38 + 0.5;
    // Lower leaves spread wider; upper whorl leaves stand steeper
    const tilt = 0.36 + t * 0.38;
    foliageParts.push(
      buildMaizeLeaf({
        length: len,
        width: w,
        archHeight: 0.26 + t * 0.08,
        droop: 0.5 - t * 0.12,
        fold: 0.013,
        baseY: y,
        stalkRadius: THREE.MathUtils.lerp(0.038, 0.025, t),
        yaw,
        tilt,
        baseBrightness: 0.78 + t * 0.12,
        tipBrightness: 1.02 + t * 0.08,
      })
    );
  }

  // Upright emerging whorl funnel at the top of the knee-high plant
  const whorl = new THREE.CylinderGeometry(0.048, 0.022, 0.22, 8, 1, true);
  whorl.translate(0, stalkH + 0.08, 0);
  accentParts.push(paintGradient(whorl, "#3d8f2c", "#6fd14e"));

  // Prop / brace roots anchoring the base
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2 + 0.4;
    const root = new THREE.CylinderGeometry(0.008, 0.014, 0.11, 5);
    root.translate(0, 0.055, 0);
    root.rotateZ(-0.48);
    root.rotateY(angle);
    root.translate(Math.cos(angle) * 0.025, 0, -Math.sin(angle) * 0.025);
    accentParts.push(paintGradient(root, "#5c3b20", "#6c8c3c"));
  }

  return {
    foliageGeo: mergeColoredGeos(foliageParts),
    accentGeo: mergeColoredGeos(accentParts),
  };
}

/* =========================================================================
   STAGE 3: TASSELING & SILKING (Days 70–98, VT–R2 stage)
   Full-height segmented stalk (1.48m), 9 canopy leaves + flag leaf,
   branched golden pollen tassel at the apex, and 2 husked green ears with
   emerging golden-rose maize silks.
   ========================================================================= */
function buildTasselingStage() {
  const foliageParts = [];
  const accentParts = [];

  const stalkH = 1.46;
  foliageParts.push(...buildSegmentedStalk(stalkH, 0.048, 0.024, 7, 0.72, 0.98));

  // 9 canopy leaves from lower stalk up to the flag leaf
  const leafCount = 9;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const bell = Math.sin(Math.PI * (0.12 + t * 0.82));
    const len = 0.38 + bell * 0.3;
    const w = 0.065 + bell * 0.034;
    const y = 0.18 + t * (stalkH - 0.24);
    const yaw = i * 2.42 + 1.1;
    const tilt = 0.34 + t * 0.34;
    foliageParts.push(
      buildMaizeLeaf({
        length: len,
        width: w,
        archHeight: 0.24 + t * 0.06,
        droop: 0.54 - t * 0.1,
        fold: 0.015,
        baseY: y,
        stalkRadius: THREE.MathUtils.lerp(0.044, 0.024, t),
        yaw,
        tilt,
        baseBrightness: 0.75 + t * 0.15,
        tipBrightness: 1.0 + t * 0.08,
      })
    );
  }

  // --- Accent 1: Branched Pollen Tassel at top of stalk ---
  const tasselBaseY = stalkH + 0.02;
  const centralSpike = new THREE.ConeGeometry(0.022, 0.34, 6);
  centralSpike.translate(0, tasselBaseY + 0.17, 0);
  accentParts.push(paintGradient(centralSpike, "#d4b84a", "#f2dc74"));

  for (let b = 0; b < 5; b++) {
    const angle = (b / 5) * Math.PI * 2 + 0.3;
    const branch = new THREE.ConeGeometry(0.015, 0.25, 5);
    branch.translate(0, 0.125, 0);
    branch.rotateZ(0.58 + (b % 2) * 0.12);
    branch.rotateY(angle);
    branch.translate(0, tasselBaseY + 0.03 + (b % 2) * 0.03, 0);
    accentParts.push(paintGradient(branch, "#cfb244", "#ebd46c"));
  }

  // --- Accent 2: Two Husked Ears + Emerging Silks at mid-stalk nodes ---
  const earNodes = [
    { y: stalkH * 0.56, yaw: 0.8, scale: 1.0 },
    { y: stalkH * 0.42, yaw: 3.9, scale: 0.84 },
  ];
  earNodes.forEach((ear) => {
    const earGroup = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ear.yaw, -0.38, "YXZ"));
    earGroup.compose(
      new THREE.Vector3(Math.cos(ear.yaw) * 0.065, ear.y, -Math.sin(ear.yaw) * 0.065),
      q,
      new THREE.Vector3(ear.scale, ear.scale, ear.scale)
    );

    // Tightly wrapped green husk
    const husk = new THREE.CapsuleGeometry(0.048, 0.18, 4, 8);
    husk.translate(0, 0.11, 0);
    husk.applyMatrix4(earGroup);
    accentParts.push(paintGradient(husk, "#58a838", "#82d454"));

    // Cascading pale-gold/rose silk tuft at the ear tip
    const silk = new THREE.ConeGeometry(0.034, 0.09, 6);
    silk.rotateZ(Math.PI * 0.82);
    silk.translate(0.02, 0.25, 0);
    silk.applyMatrix4(earGroup);
    accentParts.push(paintGradient(silk, "#e8c86b", "#f7e39c"));
  });

  return {
    foliageGeo: mergeColoredGeos(foliageParts),
    accentGeo: mergeColoredGeos(accentParts),
  };
}

/* =========================================================================
   STAGE 4: MATURE / DRY HARVEST (Days 98–120+, R5–R6 stage)
   Full-height stalk (1.52m), lower leaves drooping more strongly,
   dry straw husks peeled back to expose plump golden maize kernel cobs,
   and weathered dry bronze tassel.
   ========================================================================= */
function buildMatureStage() {
  const foliageParts = [];
  const accentParts = [];

  const stalkH = 1.5;
  foliageParts.push(...buildSegmentedStalk(stalkH, 0.048, 0.024, 7, 0.72, 0.96));

  // 9 mature leaves with stronger downward arch / senescence droop on lower nodes
  const leafCount = 9;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const bell = Math.sin(Math.PI * (0.14 + t * 0.8));
    const len = 0.36 + bell * 0.28;
    const w = 0.062 + bell * 0.032;
    const y = 0.18 + t * (stalkH - 0.24);
    const yaw = i * 2.42 + 0.6;
    const tilt = 0.22 + t * 0.32;
    foliageParts.push(
      buildMaizeLeaf({
        length: len,
        width: w,
        archHeight: 0.18 + t * 0.06,
        droop: 0.68 - t * 0.12, // heavier mature leaf droop
        fold: 0.014,
        baseY: y,
        stalkRadius: THREE.MathUtils.lerp(0.044, 0.024, t),
        yaw,
        tilt,
        baseBrightness: 0.72 + t * 0.18,
        tipBrightness: 0.95 + t * 0.08,
      })
    );
  }

  // --- Accent 1: Weathered dry harvest tassel ---
  const tasselBaseY = stalkH + 0.02;
  const centralSpike = new THREE.ConeGeometry(0.02, 0.32, 6);
  centralSpike.translate(0, tasselBaseY + 0.16, 0);
  accentParts.push(paintGradient(centralSpike, "#b89644", "#d6b865"));

  for (let b = 0; b < 5; b++) {
    const angle = (b / 5) * Math.PI * 2 + 0.5;
    const branch = new THREE.ConeGeometry(0.014, 0.24, 5);
    branch.translate(0, 0.12, 0);
    branch.rotateZ(0.68);
    branch.rotateY(angle);
    branch.translate(0, tasselBaseY + 0.03, 0);
    accentParts.push(paintGradient(branch, "#a88638", "#c9a955"));
  }

  // --- Accent 2: Two Plump Ripe Ears (peeled dry straw husks + golden kernel cob + dry brown silk) ---
  const earNodes = [
    { y: stalkH * 0.55, yaw: 0.85, scale: 1.08 },
    { y: stalkH * 0.41, yaw: 3.95, scale: 0.92 },
  ];
  earNodes.forEach((ear) => {
    const earGroup = new THREE.Matrix4();
    // Mature ears hang slightly lower due to kernel weight
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ear.yaw, -0.48, "YXZ"));
    earGroup.compose(
      new THREE.Vector3(Math.cos(ear.yaw) * 0.068, ear.y, -Math.sin(ear.yaw) * 0.068),
      q,
      new THREE.Vector3(ear.scale, ear.scale, ear.scale)
    );

    // Lower cup of dry straw husk
    const baseHusk = new THREE.CapsuleGeometry(0.052, 0.11, 4, 8);
    baseHusk.translate(0, 0.075, 0);
    baseHusk.applyMatrix4(earGroup);
    accentParts.push(paintGradient(baseHusk, "#bfa462", "#dfd698"));

    // 2 peeled-back husk leaves flanking the golden cob
    [-1, 1].forEach((side) => {
      const bract = new THREE.ConeGeometry(0.038, 0.16, 5);
      bract.scale(1, 1, 0.45);
      bract.rotateZ(side * 0.42);
      bract.translate(side * 0.035, 0.14, 0);
      bract.applyMatrix4(earGroup);
      accentParts.push(paintGradient(bract, "#c7af6e", "#e6dca2"));
    });

    // Exposed golden-yellow maize kernel cylinder/capsule
    const cob = new THREE.CapsuleGeometry(0.045, 0.14, 5, 10);
    // Subtle faceted kernel row feel
    const cobPos = cob.attributes.position;
    for (let k = 0; k < cobPos.count; k++) {
      const j = 1 + (rand(k * 7) - 0.5) * 0.06;
      cobPos.setXYZ(k, cobPos.getX(k) * j, cobPos.getY(k), cobPos.getZ(k) * j);
    }
    cob.translate(0, 0.15, 0);
    cob.applyMatrix4(earGroup);
    accentParts.push(paintGradient(cob, "#e09b1b", "#ffd23b"));

    // Darkened dry brown silk tuft at tip of mature cob
    const drySilk = new THREE.ConeGeometry(0.024, 0.055, 5);
    drySilk.translate(0, 0.255, 0);
    drySilk.applyMatrix4(earGroup);
    accentParts.push(paintGradient(drySilk, "#59381e", "#7d522d"));
  });

  return {
    foliageGeo: mergeColoredGeos(foliageParts),
    accentGeo: mergeColoredGeos(accentParts),
  };
}

let cachedStageModels = null;

export function getMaizeStageModels() {
  if (cachedStageModels) return cachedStageModels;
  cachedStageModels = {
    seedling: buildSeedlingStage(),
    vegetative: buildVegetativeStage(),
    tasseling: buildTasselingStage(),
    mature: buildMatureStage(),
  };
  return cachedStageModels;
}
