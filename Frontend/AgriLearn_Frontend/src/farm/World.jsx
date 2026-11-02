import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE, PLOT_SIZE, PLOT_GAP } from "./useFarmStore";

/* ------------------------------------------------------------------
   World: a raised "clay diorama" island.
   Everything is measured from the ground surface at y = 0, so plots,
   bushes, maize and the worker keep the heights they already use.
   ------------------------------------------------------------------ */

// Width of the whole island (grass cap and soil body).
export const GROUND_SIZE = 11.2;

// Read by butterflies and fireflies: 0 = night, 1 = full day
export const world = { day: 1 };

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// The plot grid, measured from the store so the bed always fits it.
const GRID_SPAN = GRID_SIZE * PLOT_SIZE + (GRID_SIZE - 1) * PLOT_GAP;
const BED_HALF = GRID_SPAN / 2 + 0.12; // inside edge of the wooden frame
const FRAME_W = 0.22;
const FRAME_OUT = BED_HALF + FRAME_W; // outside edge of the frame

/* ---------- Light and background ---------- */
function SkyAndLight() {
  return (
    <>
      <color attach="background" args={["#c6e8fb"]} />
      <hemisphereLight color="#ffffff" groundColor="#e8c9a0" intensity={0.95} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.45}
        color="#fff3dc"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-radius={3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/* ---------- The island: grass cap on a layered soil block ---------- */
function Island() {
  const blob = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, "rgba(40,30,20,0.32)");
    grad.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  return (
    <group>
      {/* soft shadow under the island, so it floats */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, -1.58, 0.4]}>
        <planeGeometry args={[GROUND_SIZE * 1.7, GROUND_SIZE * 1.7]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>

      {/* soil body */}
      <RoundedBox
        args={[GROUND_SIZE, 1.3, GROUND_SIZE]}
        radius={0.18}
        smoothness={4}
        position={[0, -0.85, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#8d5b34" roughness={1} />
      </RoundedBox>
      {/* darker strip, so the edge reads as layers of earth */}
      <RoundedBox
        args={[GROUND_SIZE + 0.03, 0.16, GROUND_SIZE + 0.03]}
        radius={0.06}
        smoothness={3}
        position={[0, -0.72, 0]}
      >
        <meshStandardMaterial color="#6b4326" roughness={1} />
      </RoundedBox>
      {/* grass cap with a lip that overhangs the soil */}
      <RoundedBox
        args={[GROUND_SIZE + 0.24, 0.34, GROUND_SIZE + 0.24]}
        radius={0.14}
        smoothness={4}
        position={[0, -0.17, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#7cc24a" roughness={0.95} />
      </RoundedBox>
    </group>
  );
}

/* ---------- The planting bed: dark soil base inside a clay frame ---------- */
function Bed() {
  const long = FRAME_OUT * 2;
  const bars = [
    { pos: [0, 0.14, FRAME_OUT - FRAME_W / 2], size: [long, 0.28, FRAME_W] },
    { pos: [0, 0.14, -(FRAME_OUT - FRAME_W / 2)], size: [long, 0.28, FRAME_W] },
    { pos: [FRAME_OUT - FRAME_W / 2, 0.14, 0], size: [FRAME_W, 0.28, BED_HALF * 2] },
    { pos: [-(FRAME_OUT - FRAME_W / 2), 0.14, 0], size: [FRAME_W, 0.28, BED_HALF * 2] },
  ];
  return (
    <group>
      <RoundedBox
        args={[BED_HALF * 2, 0.16, BED_HALF * 2]}
        radius={0.04}
        smoothness={3}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#5e3b20" roughness={1} />
      </RoundedBox>
      {bars.map((b, i) => (
        <RoundedBox
          key={i}
          args={b.size}
          radius={0.07}
          smoothness={3}
          position={b.pos}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#dca868" roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  );
}

/* ---------- Clouds (they also cast moving shadows) ---------- */
function Clouds() {
  const refs = useRef([]);
  const clouds = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        x: -14 + i * 6.5,
        z: (rand(i + 1) - 0.5) * 16,
        y: 6.5 + rand(i + 9) * 1.5,
        s: 0.9 + rand(i + 20) * 0.8,
        speed: 0.25 + rand(i + 30) * 0.2,
      })),
    []
  );

  useFrame((_, dt) => {
    clouds.forEach((c, i) => {
      c.x += c.speed * dt;
      if (c.x > 16) c.x = -16;
      refs.current[i]?.position.set(c.x, c.y, c.z);
    });
  });

  return clouds.map((c, i) => (
    <group key={i} ref={(el) => (refs.current[i] = el)} position={[c.x, c.y, c.z]} scale={c.s}>
      {[[0, 0, 0, 1], [0.9, -0.1, 0.2, 0.75], [-0.9, -0.15, -0.1, 0.8], [0.3, 0.25, 0.1, 0.7]].map(
        ([x, y, z, r], j) => (
          <mesh key={j} position={[x, y, z]} castShadow>
            <sphereGeometry args={[r * 0.9, 16, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={1} />
          </mesh>
        )
      )}
    </group>
  ));
}

/* ---------- Rounded trees and bushes (they sway in the wind) ---------- */
function Tree({ position, scale, seed }) {
  const g = useRef();
  useFrame((s) => {
    if (g.current) g.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.1 + seed) * 0.025;
  });
  return (
    <group ref={g} position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 1, 10]} />
        <meshStandardMaterial color="#8a5a32" roughness={1} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <icosahedronGeometry args={[0.75, 2]} />
        <meshStandardMaterial color="#4fae3f" roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 1.15, 0.2]} castShadow>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshStandardMaterial color="#5cc047" roughness={0.9} />
      </mesh>
      <mesh position={[-0.3, 1.75, -0.1]} castShadow>
        <icosahedronGeometry args={[0.45, 2]} />
        <meshStandardMaterial color="#45a037" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ScenicBush({ position, scale, seed }) {
  const g = useRef();
  useFrame((s) => {
    if (g.current) g.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.3 + seed) * 0.04;
  });
  return (
    <group ref={g} position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <icosahedronGeometry args={[0.32, 2]} />
        <meshStandardMaterial color="#3f9e35" roughness={0.9} />
      </mesh>
      <mesh position={[0.22, 0.18, 0.1]} castShadow>
        <icosahedronGeometry args={[0.24, 2]} />
        <meshStandardMaterial color="#52b843" roughness={0.9} />
      </mesh>
      <mesh position={[-0.2, 0.15, -0.12]} castShadow>
        <icosahedronGeometry args={[0.22, 2]} />
        <meshStandardMaterial color="#34862d" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Barn in the far (back) corner, turned to face the camera.
const BARN = { x: -4.6, z: -4.6 };

function Barn() {
  const W = 1.2, D = 0.9, H = 0.85, RISE = 0.45;
  const slope = Math.sqrt((W / 2) ** 2 + RISE ** 2);
  const angle = Math.atan2(RISE, W / 2);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0);
    s.lineTo(W / 2, 0);
    s.lineTo(0, RISE);
    s.closePath();
    return s;
  }, []);

  return (
    <group position={[BARN.x, 0, BARN.z]} rotation={[0, Math.PI / 4, 0]}>
      <RoundedBox args={[W, H, D]} radius={0.04} smoothness={3} position={[0, H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#d9594b" roughness={0.9} />
      </RoundedBox>
      {/* roof: two sloped slabs and a triangle at each end */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(-side * W) / 4, H + RISE / 2 + 0.02, 0]}
          rotation={[0, 0, side * angle]}
          castShadow
        >
          <boxGeometry args={[slope + 0.12, 0.07, D + 0.16]} />
          <meshStandardMaterial color="#6a4638" roughness={0.9} />
        </mesh>
      ))}
      {[D / 2 + 0.001, -D / 2 - 0.001].map((z, i) => (
        <mesh key={i} position={[0, H, z]} rotation={[0, i === 0 ? 0 : Math.PI, 0]}>
          <shapeGeometry args={[gable]} />
          <meshStandardMaterial color="#d9594b" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* white double door with a cross */}
      <mesh position={[0, 0.3, D / 2 + 0.012]}>
        <boxGeometry args={[0.46, 0.6, 0.03]} />
        <meshStandardMaterial color="#f6f0e4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, D / 2 + 0.032]} rotation={[0, 0, Math.atan2(0.6, 0.46)]}>
        <boxGeometry args={[0.7, 0.04, 0.012]} />
        <meshStandardMaterial color="#d9594b" />
      </mesh>
      <mesh position={[0, 0.3, D / 2 + 0.032]} rotation={[0, 0, -Math.atan2(0.6, 0.46)]}>
        <boxGeometry args={[0.7, 0.04, 0.012]} />
        <meshStandardMaterial color="#d9594b" />
      </mesh>
    </group>
  );
}

// Small flowers on the grass border, outside the planting bed.
const FLOWER_COLORS = ["#ff8fb8", "#ffd23f", "#ffffff", "#ff9a5c", "#b79bff"];

function Flowers() {
  const items = useMemo(() => {
    const out = [];
    for (let i = 0; out.length < 30 && i < 400; i++) {
      const x = (rand(i * 3 + 1) - 0.5) * (GROUND_SIZE - 0.8);
      const z = (rand(i * 3 + 2) - 0.5) * (GROUND_SIZE - 0.8);
      if (Math.max(Math.abs(x), Math.abs(z)) < FRAME_OUT + 0.35) continue;
      if (Math.hypot(x - BARN.x, z - BARN.z) < 1.5) continue;
      out.push({ x, z, c: FLOWER_COLORS[Math.floor(rand(i + 7) * FLOWER_COLORS.length)] });
    }
    return out;
  }, []);
  return items.map((f, i) => (
    <group key={i} position={[f.x, 0, f.z]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.12, 5]} />
        <meshStandardMaterial color="#3f9e35" />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshStandardMaterial color={f.c} roughness={0.8} />
      </mesh>
    </group>
  ));
}

const SCENERY_COUNT = 22;

function Scenery() {
  const items = useMemo(() => {
    const out = [];
    for (let i = 0; i < SCENERY_COUNT; i++) {
      // Walk round the bed on a square ring, so nothing lands on the plots
      const a = (i / SCENERY_COUNT) * Math.PI * 2 + rand(i + 1) * 0.25;
      const d = FRAME_OUT + 0.55 + rand(i + 40) * 0.75;
      const cx = Math.cos(a), cz = Math.sin(a);
      const m = Math.max(Math.abs(cx), Math.abs(cz));
      const x = (cx / m) * d;
      const z = (cz / m) * d;
      if (Math.hypot(x - BARN.x, z - BARN.z) < 1.5) continue;
      // No tall trees on the camera side: they would hide the field
      out.push({ i, tree: i % 2 === 0 && x + z < 2, x, z, s: 0.8 + rand(i + 80) * 0.5 });
    }
    return out;
  }, []);
  return items.map((it) =>
    it.tree ? (
      <Tree key={it.i} position={[it.x, 0, it.z]} scale={it.s} seed={it.i} />
    ) : (
      <ScenicBush key={it.i} position={[it.x, 0, it.z]} scale={it.s * 1.4} seed={it.i} />
    )
  );
}

/* ---------- Butterflies by day, fireflies by night ---------- */
const WING_COLORS = ["#ff9ecf", "#ffd23f", "#7fd6ff", "#ffffff"];

function Butterflies() {
  const refs = useRef([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    WING_COLORS.forEach((_, i) => {
      const g = refs.current[i];
      if (!g) return;
      const sd = i + 1;
      g.visible = world.day > 0.5;
      const x = Math.sin(t * 0.35 + sd * 2) * 3.4 + Math.cos(t * 0.21 + sd) * 1.5;
      const z = Math.cos(t * 0.3 + sd * 1.7) * 3.4;
      const dx = Math.cos(t * 0.35 + sd * 2) * 3.4 * 0.35 - Math.sin(t * 0.21 + sd) * 1.5 * 0.21;
      const dz = -Math.sin(t * 0.3 + sd * 1.7) * 3.4 * 0.3;
      g.position.set(x, 1.2 + Math.sin(t * 1.3 + sd) * 0.25, z);
      g.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 22 + sd * 5) * 0.9;
      g.children[0].rotation.z = flap;
      g.children[1].rotation.z = -flap;
    });
  });

  return WING_COLORS.map((color, i) => (
    <group key={i} ref={(el) => (refs.current[i] = el)}>
      <group>
        <mesh position={[-0.07, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 0.18]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group>
        <mesh position={[0.07, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 0.18]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  ));
}

export function World() {
  return (
    <>
      <SkyAndLight />
      <Island />
      <Bed />
      <Clouds />
      <Scenery />
      <Flowers />
      <Barn />
      <Butterflies />
    </>
  );
}