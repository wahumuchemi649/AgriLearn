import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFarmStore } from "./useFarmStore";

// Size of the island of land. Set to 60 to fill the whole screen with grass
// (you would then see no sky, only its light and colour on the land).
export const GROUND_SIZE = 120;

// Read by butterflies and fireflies: 0 = night, 1 = full day
export const world = { day: 1 };

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const C = (hex) => new THREE.Color(hex);

const NIGHT_TOP = C("#070b22"), NIGHT_BOT = C("#1b2a5c");
const DAY_TOP = C("#5aa9ee"), DAY_BOT = C("#fdebc8");
const SUN_TOP = C("#5a64b8"), SUN_BOT = C("#ff8f5a");
const MOON = C("#9db4ff"), SUNLIGHT = C("#fff1d6"), SUNSET = C("#ff9a5c");

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const FRAG = `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uStars;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  vec2 cell = floor(vUv * vec2(160.0, 90.0));
  float h = hash(cell);
  float star = step(0.9965, h) * (0.55 + 0.45 * sin(uTime * 2.5 + h * 60.0));
  col += vec3(star) * uStars * smoothstep(0.35, 0.9, vUv.y);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function SkyAndLight() {
  return (
    <>
      <color attach="background" args={["#bfe3ff"]} />
      <hemisphereLight color="#dff0ff" groundColor="#4a3d2a" intensity={0.7} />
      <directionalLight
        position={[8, 10, 5]}
        intensity={1.3}
        color="#fff1d6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}
/* ---------- Ground with a grass texture and a soil base ---------- */
function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#6aa84f";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.fillStyle =
        Math.random() > 0.5
          ? `rgba(255,255,200,${Math.random() * 0.1})`
          : `rgba(20,60,10,${Math.random() * 0.16})`;
      g.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(9, 9);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial map={tex} />
      </mesh>
      <mesh position={[0, -0.61, 0]} receiveShadow castShadow>
        <boxGeometry args={[GROUND_SIZE, 1.2, GROUND_SIZE]} />
        <meshStandardMaterial color="#6b4a2b" />
      </mesh>
    </>
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
            <sphereGeometry args={[r * 0.9, 12, 10]} />
            <meshStandardMaterial color="#ffffff" flatShading />
          </mesh>
        )
      )}
    </group>
  ));
}

/* ---------- Trees and bushes around the farm (they sway in the wind) ---------- */
function Tree({ position, scale, seed }) {
  const g = useRef();
  useFrame((s) => {
    if (g.current) g.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.1 + seed) * 0.025;
  });
  return (
    <group ref={g} position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1, 6]} />
        <meshStandardMaterial color="#6b4a2b" />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <coneGeometry args={[0.8, 1.6, 7]} />
        <meshStandardMaterial color="#2f7d32" flatShading />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <coneGeometry args={[0.6, 1.3, 7]} />
        <meshStandardMaterial color="#388e3c" flatShading />
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
  );
}

function Scenery() {
  const items = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2 + rand(i + 1) * 0.25;
        const r = 5.4 + rand(i + 40) * 2.8;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // No tall trees on the camera side: they would hide the field
        return { i, tree: i % 2 === 0 && x + z < 2, x, z, s: 0.8 + rand(i + 80) * 0.7 };
      }),
    []
  );
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

function Fireflies() {
  const refs = useRef([]);
  const flies = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        a: rand(i + 1) * 6,
        b: rand(i + 7) * 6,
        r: 2 + rand(i + 13) * 4,
        y: 0.5 + rand(i + 19) * 1.4,
      })),
    []
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    flies.forEach((f, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = world.day < 0.75;
      m.position.set(
        Math.cos(t * 0.3 + f.a) * f.r,
        f.y + Math.sin(t * 0.9 + f.b) * 0.2,
        Math.sin(t * 0.25 + f.b) * f.r
      );
      m.scale.setScalar(0.6 + 0.4 * Math.sin(t * 3 + f.a * 3));
    });
  });
  return flies.map((_, i) => (
    <mesh key={i} ref={(el) => (refs.current[i] = el)}>
      <sphereGeometry args={[0.045, 8, 8]} />
      <meshBasicMaterial color="#e8ff7a" toneMapped={false} />
    </mesh>
  ));
}

export function World() {
  return (
    <>
      <SkyAndLight />
      <Ground />
      <Clouds />
      <Scenery />
      <Butterflies />
    </>
  );
}