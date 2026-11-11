import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFarmStore, PLOT_SIZE } from "./useFarmStore";
import { stageName } from "../api/farm";
import { emit, addShake } from "./Effects";
import { sfx } from "./sound";
import { getMaizeStageModels } from "./maizeStageModels";

// Virtual days from planting to full maturity. Set this to maize's real value.
const GROW_DAYS = 120;

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- Which stages are done ---------- */
// A stage that is no longer in "available actions" is finished.
export function useFieldProgress() {
  const loaded = useFarmStore((s) => s.loaded);
  const actions = useFarmStore((s) => s.actions);
  return useMemo(() => {
    const remaining = actions.map((a) => String(stageName(a)).toLowerCase());
    const pending = (key) => remaining.some((n) => n.includes(key));
    return {
      loaded,
      cleared: loaded && !pending("bush"),
      tilled: loaded && !pending("primary"),
      furrowed: loaded && !pending("secondary"),
      planted: loaded && !pending("planting"),
      fertilized: loaded && (!pending("basal") || !pending("top dressing")),
      weeded: loaded && !pending("first weeding"),
    };
  }, [loaded, actions]);
}

/* ---------- The clearing crew: a worker sweeps the field ---------- */
const ROUTE = [
  [-5.3, -2.7], [3.6, -2.7], [3.6, -0.9], [-3.6, -0.9],
  [-3.6, 0.9], [3.6, 0.9], [3.6, 2.7], [-3.6, 2.7],
];
const SPEED = 9; // units per second
const START_DELAY = 0.3;

const SEG = [];
let total = 0;
for (let i = 1; i < ROUTE.length; i++) {
  const [x0, z0] = ROUTE[i - 1];
  const [x1, z1] = ROUTE[i];
  const len = Math.hypot(x1 - x0, z1 - z0);
  SEG.push({ x0, z0, x1, z1, len, start: total });
  total += len;
}
const ROUTE_LEN = total;
const ROUTE_TIME = total / SPEED;

function routePoint(s) {
  const d = Math.min(Math.max(s, 0), ROUTE_LEN);
  const seg = SEG.find((g) => d <= g.start + g.len) ?? SEG[SEG.length - 1];
  const u = (d - seg.start) / seg.len;
  return {
    x: seg.x0 + (seg.x1 - seg.x0) * u,
    z: seg.z0 + (seg.z1 - seg.z0) * u,
    dx: (seg.x1 - seg.x0) / seg.len,
    dz: (seg.z1 - seg.z0) / seg.len,
  };
}

// When does the worker pass closest to this spot?
function timeAlongRoute(x, z) {
  let best = Infinity;
  let bestS = 0;
  for (let s = 0; s <= ROUTE_LEN; s += 0.15) {
    const p = routePoint(s);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) {
      best = d;
      bestS = s;
    }
  }
  return bestS / SPEED;
}

// Seconds since clearing started (-1 = not started). Shared by worker and bushes.
const crew = { t: -1 };

let lastChop = 0;
function hit(x, z) {
  emit({
    x, z, y: 0.5, count: 16, spread: 0.5, speed: 2.2, up: 3.2, size: 0.12, life: 1.1, gravity: 7,
    colors: ["#4f9a3a", "#6dbb4a", "#2f6b2a", "#9ad46a"],
  });
  addShake(0.28);
  const now = performance.now();
  if (now - lastChop > 140) {
    lastChop = now;
    sfx.chop();
  }
}

function Bush({ position, size, clearAt, seed, instantGone }) {
  const g = useRef();
  const patch = useRef();
  const fired = useRef(false);

  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const t = state.clock.elapsedTime;
    const ct = crew.t;
    let s = 1;
    let p = 0;

    if (instantGone) {
      s = 0;
      p = 1;
    } else if (ct >= clearAt) {
      if (!fired.current) {
        fired.current = true;
        hit(position[0], position[2]);
      }
      const k = Math.min(1, (ct - clearAt) / 0.35);
      s = 1 - k * k;
      p = Math.min(1, (ct - clearAt) / 0.5);
      grp.rotation.y = k * 7;
    } else if (ct >= 0 && clearAt - ct < 0.3) {
      s = 1 + Math.sin(ct * 60) * 0.06; // quiver just before the cut
    }

    grp.visible = s > 0.01;
    grp.scale.setScalar(Math.max(s, 0.0001) * size);
    grp.rotation.z = Math.sin(t * 1.3 + seed) * 0.04; // wind

    if (patch.current) {
      patch.current.visible = p > 0;
      patch.current.scale.setScalar(Math.max(p, 0.0001));
    }
  });

  return (
    <>
      <mesh ref={patch} position={[position[0], 0.205, position[2]]} receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.012, 20]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <group ref={g} position={position}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <icosahedronGeometry args={[0.32, 2]} />
          <meshStandardMaterial color="#2f6b2a" roughness={0.9} />
        </mesh>
        <mesh position={[0.22, 0.18, 0.1]} castShadow>
          <icosahedronGeometry args={[0.24, 2]} />
          <meshStandardMaterial color="#3b7d33" roughness={0.9} />
        </mesh>
        <mesh position={[-0.2, 0.15, -0.12]} castShadow>
          <icosahedronGeometry args={[0.22, 2]} />
          <meshStandardMaterial color="#27581f" roughness={0.9} />
        </mesh>
      </group>
    </>
  );
}

export function FieldBushes() {
  const loaded = useFarmStore((s) => s.loaded);
  const plots = useFarmStore((s) => s.plots);
  const { cleared } = useFieldProgress();

  // Was the land already clear when the page loaded? Then skip the show.
  const startCleared = useRef(null);
  if (!loaded) startCleared.current = null;
  else if (startCleared.current === null) startCleared.current = cleared;

  const played = useRef(false);
  useEffect(() => {
    if (!loaded) {
      played.current = false;
      crew.t = -1;
      return;
    }
    if (cleared && startCleared.current === false && !played.current) {
      played.current = true;
      crew.t = 0; // start the worker
    }
  }, [loaded, cleared]);

  useFrame((_, dt) => {
    if (crew.t >= 0) crew.t += Math.min(dt, 0.05);
  });

  const bushes = useMemo(
    () =>
      plots.flatMap((p) =>
        [0, 1].map((k) => {
          const seed = p.id * 10 + k + 1;
          const x = p.position[0] + (rand(seed + 1) - 0.5) * 0.6;
          const z = p.position[2] + (rand(seed + 2) - 0.5) * 0.6;
          return {
            seed,
            size: 0.8 + rand(seed) * 0.6,
            position: [x, 0.2, z],
            clearAt: Math.max(0, START_DELAY + timeAlongRoute(x, z) - 0.2),
          };
        })
      ),
    [plots]
  );

  if (!loaded) return null;
  return bushes.map((b) => (
    <Bush
      key={b.seed}
      position={b.position}
      size={b.size}
      clearAt={b.clearAt}
      seed={b.seed}
      instantGone={startCleared.current === true}
    />
  ));
}

export function Worker() {
  const g = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();

  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const ct = crew.t - START_DELAY;
    if (crew.t < 0 || ct > ROUTE_TIME + 0.4) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    const t = state.clock.elapsedTime;
    const p = routePoint(Math.max(0, ct) * SPEED);
    const swing = Math.sin(t * 14);
    grp.position.set(p.x, 0.17 + Math.abs(swing) * 0.05, p.z);
    grp.rotation.y = Math.atan2(p.dx, p.dz);
    const fade = ct > ROUTE_TIME ? Math.max(0, 1 - (ct - ROUTE_TIME) / 0.4) : 1;
    grp.scale.setScalar(Math.max(1.5 * fade, 0.0001));
    legL.current.rotation.x = swing * 0.7;
    legR.current.rotation.x = -swing * 0.7;
    armL.current.rotation.x = -swing * 0.5;
    armR.current.rotation.x = -1.3 + Math.sin(t * 16) * 0.8; // chopping arm
  });

  const skin = "#c68642";
  return (
    <group ref={g} visible={false}>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.32, 0.4, 0.2]} />
        <meshStandardMaterial color="#2f7fc1" />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.03, 12]} />
        <meshStandardMaterial color="#f0cf6a" />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.1, 10]} />
        <meshStandardMaterial color="#f0cf6a" />
      </mesh>
      <group ref={legL} position={[-0.08, 0.38, 0]}>
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.11, 0.34, 0.11]} />
          <meshStandardMaterial color="#3b3b3b" />
        </mesh>
      </group>
      <group ref={legR} position={[0.08, 0.38, 0]}>
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.11, 0.34, 0.11]} />
          <meshStandardMaterial color="#3b3b3b" />
        </mesh>
      </group>
      <group ref={armL} position={[-0.21, 0.74, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <boxGeometry args={[0.08, 0.3, 0.08]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      <group ref={armR} position={[0.21, 0.74, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <boxGeometry args={[0.08, 0.3, 0.08]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, -0.34, 0.04]} castShadow>
          <boxGeometry args={[0.03, 0.3, 0.02]} />
          <meshStandardMaterial color="#b9c0c8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Furrows and seed holes (child of a Plot mesh) ---------- */
// Plants sit at +-PLANT_OFFSET, so the two rows and the four holes line up with them.
export const PLANT_OFFSET = 0.38;

export function Furrows() {
  const spots = [
    [-PLANT_OFFSET, -PLANT_OFFSET],
    [PLANT_OFFSET, -PLANT_OFFSET],
    [-PLANT_OFFSET, PLANT_OFFSET],
    [PLANT_OFFSET, PLANT_OFFSET],
  ];
  return (
    <>
      {[-PLANT_OFFSET, PLANT_OFFSET].map((z) => (
        <mesh key={z} position={[0, 0.104, z]}>
          <boxGeometry args={[PLOT_SIZE * 0.9, 0.02, 0.2]} />
          <meshStandardMaterial color="#6b4120" roughness={1} />
        </mesh>
      ))}
      {spots.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0.112, z]}>
          <mesh>
            <cylinderGeometry args={[0.085, 0.085, 0.02, 14]} />
            <meshStandardMaterial color="#2f1a0b" roughness={1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
            <torusGeometry args={[0.1, 0.028, 8, 16]} />
            <meshStandardMaterial color="#b9824a" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* ---------- Maize: Instanced 4-Stage Growth Meshes ----------
   Stage 1: Seedling            (s: 0.00 – 0.25, Days 0–30)
   Stage 2: Vegetative / Whorl  (s: 0.25 – 0.58, Days 30–70, knee-high weeding & top-dressing)
   Stage 3: Tasseling & Silking (s: 0.58 – 0.82, Days 70–98)
   Stage 4: Mature / Harvest    (s: 0.82 – 1.00, Days 98–120+)
   ------------------------------------------------------------ */
const GREEN = new THREE.Color("#4fae3a");
const GOLD = new THREE.Color("#d9b030");
const DRY = new THREE.Color("#8a683a");
const WHITE = new THREE.Color("#ffffff");

// Leaf colour by health. The stops follow the five states in the engine:
// 85+ Thriving, 65+ Healthy, 40+ Stressed, 15+ Stunted, below 15 Dead.
const HEALTH_STOPS = [
  [0.0, new THREE.Color("#6b5232")],
  [0.15, new THREE.Color("#a67c3a")],
  [0.4, new THREE.Color("#cdbb3a")],
  [0.65, new THREE.Color("#86c03a")],
  [0.85, new THREE.Color("#4fae3a")],
  [1.0, new THREE.Color("#4fae3a")],
];
function healthColor(h, out) {
  const x = clamp01(h);
  for (let i = 1; i < HEALTH_STOPS.length; i++) {
    const [h1, c1] = HEALTH_STOPS[i];
    if (x <= h1) {
      const [h0, c0] = HEALTH_STOPS[i - 1];
      return out.copy(c0).lerp(c1, (x - h0) / (h1 - h0));
    }
  }
  return out.copy(GREEN);
}

const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const PLANT_SPOTS = [
  [-PLANT_OFFSET, -PLANT_OFFSET],
  [PLANT_OFFSET, -PLANT_OFFSET],
  [-PLANT_OFFSET, PLANT_OFFSET],
  [PLANT_OFFSET, PLANT_OFFSET],
];

// Shared wind time uniform for instanced maize canopies
const maizeWindUniform = { value: 0 };

function makeMaizeInstancedMaterial(roughness = 0.82) {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    roughness,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = maizeWindUniform;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        // Height-weighted wind sway so stalks stay anchored at soil level (y = 0.2)
        float hWeight = clamp((wp.y - 0.2) / 1.4, 0.0, 1.4);
        float phase = wp.x * 1.3 + wp.z * 1.1;
        float sway = sin(uTime * 1.8 + phase) + 0.35 * cos(uTime * 3.1 - phase * 1.4);
        transformed.x += sway * 0.032 * hWeight * hWeight;
        transformed.z += sway * 0.022 * hWeight * hWeight;
        #include <project_vertex>
        `
      );
  };
  return mat;
}

// Compute smooth per-stage scale weights for a plant at growth progress s in [0, 1]
function getStageScales(s) {
  // Smooth overlap bands (+/- 0.035) around thresholds 0.25, 0.58, 0.82 so stage swaps never pop
  const fadeOutSeedling = 1 - THREE.MathUtils.smoothstep(s, 0.215, 0.285);
  const fadeInVeg = THREE.MathUtils.smoothstep(s, 0.215, 0.285);
  const fadeOutVeg = 1 - THREE.MathUtils.smoothstep(s, 0.545, 0.615);
  const fadeInTassel = THREE.MathUtils.smoothstep(s, 0.545, 0.615);
  const fadeOutTassel = 1 - THREE.MathUtils.smoothstep(s, 0.785, 0.855);
  const fadeInMature = THREE.MathUtils.smoothstep(s, 0.785, 0.855);

  // Within each stage, the plant also grows progressively taller/fuller
  const seedlingGrowth = 0.68 + 0.44 * clamp01(s / 0.25);
  const vegGrowth = 0.8 + 0.32 * clamp01((s - 0.22) / 0.36);
  const tasselGrowth = 0.92 + 0.16 * clamp01((s - 0.55) / 0.27);
  const matureGrowth = 0.98 + 0.08 * clamp01((s - 0.79) / 0.21);

  return {
    seedling: fadeOutSeedling * seedlingGrowth,
    vegetative: fadeInVeg * fadeOutVeg * vegGrowth,
    tasseling: fadeInTassel * fadeOutTassel * tasselGrowth,
    mature: fadeInMature * matureGrowth,
  };
}

export function MaizeField() {
  const loaded = useFarmStore((s) => s.loaded);
  const { planted } = useFieldProgress();
  const plots = useFarmStore((s) => s.plots);
  const cycle = useFarmStore((s) => s.cycle);
  const plantedDay = useFarmStore((s) => s.plantedDay);
  const setPlantedDay = useFarmStore((s) => s.setPlantedDay);

  const day = Number(cycle?.virtual_day);
  const hp = Number(cycle?.current_health_score);
  const health = Number.isFinite(hp) ? clamp01(hp / 100) : 1;

  const growth =
    plantedDay === null || !Number.isFinite(day) ? 0 : clamp01((day - plantedDay) / GROW_DAYS);

  // Animate the planting seed-drop wave only if planting happens live while watching
  const [animate, setAnimate] = useState(false);
  const initial = useRef(null);
  useEffect(() => {
    if (!loaded) {
      initial.current = null;
      setAnimate(false);
      return;
    }
    if (initial.current === null) {
      initial.current = planted;
      return;
    }
    if (planted && !initial.current) {
      initial.current = true;
      setAnimate(true);
      sfx.plant();
    }
  }, [loaded, planted]);

  // Planted in an earlier session with no saved day: restart growth from now
  useEffect(() => {
    if (planted && plantedDay === null && Number.isFinite(day)) setPlantedDay(day);
  }, [planted, plantedDay, day, setPlantedDay]);

  const stageModels = useMemo(() => getMaizeStageModels(), []);
  const seedGeo = useMemo(() => new THREE.SphereGeometry(0.065, 8, 8), []);

  const mats = useMemo(
    () => ({
      foliage: makeMaizeInstancedMaterial(0.8),
      accent: makeMaizeInstancedMaterial(0.86),
      seed: new THREE.MeshStandardMaterial({ color: "#8a5322", roughness: 0.85 }),
    }),
    []
  );

  // 64 plant descriptors (4 per plot across the 16 plots)
  const plants = useMemo(
    () =>
      plots.flatMap((p) =>
        PLANT_SPOTS.map(([dx, dz], k) => {
          const seed = p.id * 4 + k + 500;
          return {
            seed,
            x: p.position[0] + dx + (rand(seed) - 0.5) * 0.05,
            z: p.position[2] + dz + (rand(seed + 1) - 0.5) * 0.05,
            yaw: rand(seed + 2) * Math.PI * 2,
            scaleJitter: 0.92 + rand(seed + 4) * 0.16,
            hueShift: (rand(seed + 5) - 0.5) * 0.03,
            lightShift: (rand(seed + 6) - 0.5) * 0.06,
            // Diagonal planting wave across the field
            delay: ((p.id % 4) + Math.floor(p.id / 4)) * 0.14 + rand(seed + 3) * 0.35 + 0.1,
          };
        })
      ),
    [plots]
  );

  // Per-plant runtime state for smooth growth interpolation & seed landing tracking
  const runtimeRef = useRef({
    clock: 0,
    shown: [],
    landed: [],
    initialized: false,
  });

  // Reset runtime state whenever planting state or animation mode changes
  useEffect(() => {
    const rt = runtimeRef.current;
    rt.clock = 0;
    rt.shown = plants.map(() => (animate ? 0 : growth));
    rt.landed = plants.map(() => !animate);
    rt.initialized = true;
  }, [plants, animate, planted]);

  // InstancedMesh refs for the 4 stages (foliage + accent) and falling seeds
  const seedRef = useRef();
  const seedlingFolRef = useRef();
  const seedlingAccRef = useRef();
  const vegFolRef = useRef();
  const vegAccRef = useRef();
  const tasselFolRef = useRef();
  const tasselAccRef = useRef();
  const matureFolRef = useRef();
  const matureAccRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seedDummy = useMemo(() => new THREE.Object3D(), []);
  const baseLeafColor = useMemo(() => new THREE.Color(), []);
  const instanceLeafColor = useMemo(() => new THREE.Color(), []);
  const instanceAccentColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, dt) => {
    if (!planted) return;
    maizeWindUniform.value = state.clock.elapsedTime;

    const rt = runtimeRef.current;
    if (!rt.initialized || rt.shown.length !== plants.length) {
      rt.shown = plants.map(() => (!animate ? growth : 0));
      rt.landed = plants.map(() => !animate);
      rt.initialized = true;
    }

    rt.clock += Math.min(dt, 0.05);
    const instant = !animate;
    const stunt = 0.58 + 0.42 * THREE.MathUtils.smoothstep(health, 0.1, 0.85);
    const stressLean = (1 - health) * 0.42;

    const stagePairs = [
      [seedlingFolRef.current, seedlingAccRef.current],
      [vegFolRef.current, vegAccRef.current],
      [tasselFolRef.current, tasselAccRef.current],
      [matureFolRef.current, matureAccRef.current],
    ];

    for (let i = 0; i < plants.length; i++) {
      const pl = plants[i];
      const c = rt.clock - pl.delay;
      const kDrop = instant ? 1 : clamp01(c / 0.5);
      const kPop = instant ? 1 : clamp01((c - 0.5) / 0.7);

      // 1. Seed falling from the sky during live planting
      if (seedRef.current) {
        const showSeed = !instant && c > 0 && kDrop < 1;
        if (showSeed) {
          seedDummy.position.set(pl.x, 0.2 + 3.2 * (1 - kDrop * kDrop), pl.z);
          seedDummy.scale.setScalar(1);
        } else {
          seedDummy.position.set(pl.x, -10, pl.z);
          seedDummy.scale.setScalar(0.0001);
        }
        seedDummy.updateMatrix();
        seedRef.current.setMatrixAt(i, seedDummy.matrix);
      }

      if (kDrop >= 1 && !rt.landed[i]) {
        rt.landed[i] = true;
        emit({
          x: pl.x,
          z: pl.z,
          y: 0.25,
          count: 7,
          spread: 0.1,
          speed: 1,
          up: 1.6,
          size: 0.06,
          life: 0.6,
          colors: ["#6b4423", "#8b5a2b"],
        });
      }

      // 2. Smooth growth progression per plant
      rt.shown[i] += (growth - rt.shown[i]) * Math.min(1, dt * 1.4);
      const s = rt.shown[i];

      // 3. Squash & stretch pop-in envelope
      const pop = kPop <= 0 ? 0 : easeOutBack(kPop);
      const wob = Math.sin(kPop * Math.PI * 3) * (1 - kPop);
      const popXZ = Math.max(pop * (1 - 0.22 * wob), 0);
      const popY = Math.max(pop * (1 + 0.32 * wob), 0);

      // 4. Compute stage weights for Seedling, Vegetative, Tasseling, and Mature
      const weights = getStageScales(s);
      const stageScaleList = [
        weights.seedling,
        weights.vegetative,
        weights.tasseling,
        weights.mature,
      ];

      // 5. Compute plant foliage color (health + golden ripening in mature stage + per-plant HSL jitter)
      const ripe = THREE.MathUtils.smoothstep(s, 0.76, 1.0);
      healthColor(health, baseLeafColor).lerp(GOLD, ripe * (0.3 + 0.7 * health));
      instanceLeafColor.copy(baseLeafColor).offsetHSL(pl.hueShift, 0, pl.lightShift);
      instanceAccentColor.copy(WHITE).lerp(DRY, (1 - health) * 0.55);

      const leanZ = stressLean * clamp01(s * 2.5);

      // Update each of the 4 stage InstancedMeshes for plant i
      for (let st = 0; st < 4; st++) {
        const [folMesh, accMesh] = stagePairs[st];
        if (!folMesh || !accMesh) continue;

        const w = stageScaleList[st] * pl.scaleJitter;
        const sxz = popXZ * w * (0.75 + 0.25 * stunt);
        const sy = popY * w * stunt;

        if (sxz <= 0.001 || sy <= 0.001) {
          dummy.position.set(pl.x, -10, pl.z);
          dummy.scale.setScalar(0.00001);
        } else {
          dummy.position.set(pl.x, 0.2, pl.z);
          dummy.rotation.set(0, pl.yaw, leanZ);
          dummy.scale.set(sxz, sy, sxz);
        }
        dummy.updateMatrix();

        folMesh.setMatrixAt(i, dummy.matrix);
        folMesh.setColorAt(i, instanceLeafColor);

        accMesh.setMatrixAt(i, dummy.matrix);
        accMesh.setColorAt(i, instanceAccentColor);
      }
    }

    if (seedRef.current) seedRef.current.instanceMatrix.needsUpdate = true;
    stagePairs.forEach(([folMesh, accMesh]) => {
      if (folMesh) {
        folMesh.instanceMatrix.needsUpdate = true;
        if (folMesh.instanceColor) folMesh.instanceColor.needsUpdate = true;
      }
      if (accMesh) {
        accMesh.instanceMatrix.needsUpdate = true;
        if (accMesh.instanceColor) accMesh.instanceColor.needsUpdate = true;
      }
    });
  });

  if (!planted || !plants.length) return null;
  const count = plants.length;

  return (
    <group>
      {/* Instanced falling seeds during initial planting */}
      <instancedMesh ref={seedRef} args={[seedGeo, mats.seed, count]} frustumCulled={false} />

      {/* Stage 1: Seedling (V2–V3 sprout + soil mound) */}
      <instancedMesh
        ref={seedlingFolRef}
        args={[stageModels.seedling.foliageGeo, mats.foliage, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={seedlingAccRef}
        args={[stageModels.seedling.accentGeo, mats.accent, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {/* Stage 2: Vegetative / Knee-High Whorl (V6–V8 whorl + brace roots) */}
      <instancedMesh
        ref={vegFolRef}
        args={[stageModels.vegetative.foliageGeo, mats.foliage, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={vegAccRef}
        args={[stageModels.vegetative.accentGeo, mats.accent, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {/* Stage 3: Tasseling & Silking (Full stalk + branched pollen tassel + husked ears & silks) */}
      <instancedMesh
        ref={tasselFolRef}
        args={[stageModels.tasseling.foliageGeo, mats.foliage, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={tasselAccRef}
        args={[stageModels.tasseling.accentGeo, mats.accent, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {/* Stage 4: Mature / Dry Harvest (Senescing stalk + peeled straw husks + golden kernel cobs) */}
      <instancedMesh
        ref={matureFolRef}
        args={[stageModels.mature.foliageGeo, mats.foliage, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={matureAccRef}
        args={[stageModels.mature.accentGeo, mats.accent, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    </group>
  );
}