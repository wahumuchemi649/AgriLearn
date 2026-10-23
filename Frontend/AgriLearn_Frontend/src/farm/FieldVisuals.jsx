import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFarmStore, PLOT_SIZE } from "./useFarmStore";
import { stageName } from "../api/farm";
import { emit, addShake } from "./Effects";
import { sfx } from "./sound";

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
    };
  }, [loaded, actions]);
}

/* ---------- The clearing crew: a worker sweeps the field ---------- */
const ROUTE = [
  [-6.5, -2.7], [3.6, -2.7], [3.6, -0.9], [-3.6, -0.9],
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
          <icosahedronGeometry args={[0.32, 0]} />
          <meshStandardMaterial color="#2f6b2a" flatShading />
        </mesh>
        <mesh position={[0.22, 0.18, 0.1]} castShadow>
          <icosahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial color="#3b7d33" flatShading />
        </mesh>
        <mesh position={[-0.2, 0.15, -0.12]} castShadow>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#27581f" flatShading />
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

/* ---------- Furrows (child of a Plot mesh) ---------- */
export function Furrows() {
  return (
    <>
      {[-0.5, 0, 0.5].map((z) => (
        <mesh key={z} position={[0, 0.105, z]}>
          <boxGeometry args={[PLOT_SIZE * 0.9, 0.025, 0.14]} />
          <meshStandardMaterial color="#4a2c12" />
        </mesh>
      ))}
    </>
  );
}

/* ---------- Maize: seed drop, pop, then growth stages ---------- */
const GREEN = new THREE.Color("#4fae3a");
const GOLD = new THREE.Color("#d9b030");
const DRY = new THREE.Color("#7a5a30");

const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function MaizePlant({ x, z, growth, health, seed, delay, instant, mats }) {
  const root = useRef();
  const inner = useRef();
  const seedMesh = useRef();
  const stalk = useRef();
  const mound = useRef();
  const tassel = useRef();
  const cob = useRef();
  const leaves = useRef([]);
  const shown = useRef(instant ? growth : 0);
  const clock = useRef(0);
  const landed = useRef(instant);

  useFrame((state, dt) => {
    clock.current += dt;
    const c = clock.current - delay;
    const kDrop = instant ? 1 : clamp01(c / 0.5);
    const kPop = instant ? 1 : clamp01((c - 0.5) / 0.7);

    // 1. The seed falls from the sky
    if (seedMesh.current) {
      seedMesh.current.visible = !instant && c > 0 && kDrop < 1;
      seedMesh.current.position.y = 3.2 * (1 - kDrop * kDrop);
    }
    if (kDrop >= 1 && !landed.current) {
      landed.current = true;
      emit({
        x, z, y: 0.25, count: 7, spread: 0.1, speed: 1, up: 1.6, size: 0.06, life: 0.6,
        colors: ["#6b4423", "#8b5a2b"],
      });
    }

    // 2. The plant pops up with squash and stretch
    const pop = kPop <= 0 ? 0 : easeOutBack(kPop);
    const wob = Math.sin(kPop * Math.PI * 3) * (1 - kPop);
    inner.current.visible = kPop > 0;
    inner.current.scale.set(
      Math.max(pop * (1 - 0.25 * wob), 0.0001),
      Math.max(pop * (1 + 0.35 * wob), 0.0001),
      Math.max(pop * (1 - 0.25 * wob), 0.0001)
    );

    // 3. Slow growth, never a snap
    shown.current += (growth - shown.current) * Math.min(1, dt * 1.2);
    const s = shown.current;
    const H = 1.1 * (0.12 + 0.95 * s);

    stalk.current.scale.y = H / 1.1;
    stalk.current.position.y = H / 2;

    const mk = Math.max(1 - s / 0.3, 0.0001);
    mound.current.visible = s < 0.3;
    mound.current.scale.set(mk, 0.4 * mk, mk);

    leaves.current.forEach((lf, i) => {
      if (!lf) return;
      const k = clamp01((s - (0.06 + i * 0.14)) / 0.15);
      lf.visible = k > 0;
      lf.scale.setScalar(Math.max(k, 0.0001));
      lf.position.y = H * (0.28 + i * 0.2);
    });

    const tk = clamp01((s - 0.6) / 0.2);
    tassel.current.visible = tk > 0;
    tassel.current.scale.setScalar(Math.max(tk, 0.0001));
    tassel.current.position.y = H + 0.1;

    const ck = clamp01((s - 0.78) / 0.15);
    cob.current.visible = ck > 0;
    cob.current.scale.setScalar(Math.max(ck, 0.0001));
    cob.current.position.y = H * 0.55;

    // 4. Wind, breathing, and drooping when unhealthy
    const t = state.clock.elapsedTime;
    root.current.rotation.z =
      Math.sin(t * 1.4 + seed) * 0.035 * (0.3 + s) + (1 - health) * 0.5 * clamp01(s * 3);
    root.current.scale.setScalar(1 + Math.sin(t * 1.8 + seed) * 0.012);
  });

  return (
    <group ref={root} position={[x, 0.2, z]}>
      <mesh ref={seedMesh} material={mats.seed} visible={false}>
        <sphereGeometry args={[0.07, 8, 8]} />
      </mesh>

      <group ref={inner} visible={false}>
        <mesh ref={mound} position={[0, 0.03, 0]} material={mats.mound}>
          <sphereGeometry args={[0.17, 10, 6]} />
        </mesh>
        <mesh ref={stalk} material={mats.stalk} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 1.1, 6]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <group
            key={i}
            ref={(el) => (leaves.current[i] = el)}
            rotation={[0, i * 1.9 + 0.4, 0]}
            scale={0.0001}
          >
            <mesh position={[0.26, 0, 0]} rotation={[0, 0, 0.5]} material={mats.leaf} castShadow>
              <boxGeometry args={[0.52, 0.02, 0.12]} />
            </mesh>
            <mesh position={[-0.26, 0, 0]} rotation={[0, 0, -0.5]} material={mats.leaf} castShadow>
              <boxGeometry args={[0.52, 0.02, 0.12]} />
            </mesh>
          </group>
        ))}
        <mesh ref={tassel} material={mats.cob} scale={0.0001}>
          <coneGeometry args={[0.05, 0.28, 6]} />
        </mesh>
        <mesh ref={cob} position-x={0.09} rotation={[0, 0, -0.3]} material={mats.cob} castShadow scale={0.0001}>
          <cylinderGeometry args={[0.07, 0.05, 0.28, 8]} />
        </mesh>
      </group>
    </group>
  );
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

  // Animate the planting only if it happens while you are watching
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

  const mats = useMemo(
    () => ({
      leaf: new THREE.MeshStandardMaterial({ color: GREEN }),
      stalk: new THREE.MeshStandardMaterial({ color: GREEN }),
      cob: new THREE.MeshStandardMaterial({ color: "#e8c547" }),
      mound: new THREE.MeshStandardMaterial({ color: "#6b4423" }),
      seed: new THREE.MeshStandardMaterial({ color: "#7a4a22" }),
    }),
    []
  );
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const ripe = THREE.MathUtils.smoothstep(growth, 0.75, 1);
    target.copy(GREEN).lerp(GOLD, ripe).lerp(DRY, (1 - health) * 0.7);
    mats.leaf.color.lerp(target, Math.min(1, dt * 2));
    mats.stalk.color.copy(mats.leaf.color).multiplyScalar(0.85);
  });

  const plants = useMemo(
    () =>
      plots.flatMap((p) =>
        [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].map(([dx, dz], k) => {
          const seed = p.id * 4 + k + 500;
          return {
            seed,
            x: p.position[0] + dx + (rand(seed) - 0.5) * 0.15,
            z: p.position[2] + dz + (rand(seed + 1) - 0.5) * 0.15,
            // a diagonal wave across the field
            delay: ((p.id % 4) + Math.floor(p.id / 4)) * 0.14 + rand(seed + 3) * 0.35 + 0.1,
          };
        })
      ),
    [plots]
  );

  if (!planted) return null;
  return plants.map((pl) => (
    <MaizePlant
      key={pl.seed}
      x={pl.x}
      z={pl.z}
      seed={pl.seed}
      delay={pl.delay}
      growth={growth}
      health={health}
      instant={!animate}
      mats={mats}
    />
  ));
}