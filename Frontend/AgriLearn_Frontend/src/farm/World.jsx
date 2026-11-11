import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Sky, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE, PLOT_SIZE, PLOT_GAP } from "./useFarmStore";
import { getPbrTextureSets } from "./pbrTextures";
import { getDefaultTreeArchetypes, loadOptionalGltfTreeArchetypes } from "./kenyanTrees";

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

/* ---------- Sky, Atmospheric Fog, Environment IBL & Sunlight ---------- */
function SkyAndLight() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    // Soft horizon haze so distant treelines and rolling hills fade into the sky
    scene.fog = new THREE.Fog(0xcfe3f0, 30, 120);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  return (
    <>
      <color attach="background" args={["#cfe3f0"]} />
      <fog attach="fog" args={["#cfe3f0", 30, 120]} />

      {/* Physical Preetham atmospheric gradient sky dome */}
      <Sky
        distance={450}
        sunPosition={[8, 12, 6]}
        turbidity={6.5}
        rayleigh={1.6}
        mieCoefficient={0.005}
        mieDirectionalG={0.82}
      />

      {/* Offline-ready HDR environment map (IBL) for realistic ambient light & reflections */}
      <Environment resolution={256} environmentIntensity={0.55}>
        {/* Overhead sky dome fill */}
        <Lightformer
          form="ring"
          intensity={1.4}
          color="#bce0f7"
          scale={[20, 20, 1]}
          position={[0, 15, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* Warm golden sun directional bounce */}
        <Lightformer
          form="circle"
          intensity={2.4}
          color="#fff1d0"
          scale={[8, 8, 1]}
          position={[8, 12, 6]}
          target={[0, 0, 0]}
        />
        {/* Warm Kenyan earth ground bounce */}
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#d9ab78"
          scale={[25, 25, 1]}
          position={[0, -10, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </Environment>

      <hemisphereLight color="#e8f4fc" groundColor="#d8b288" intensity={0.65} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.55}
        color="#fff2d6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={0.5}
        shadow-camera-far={65}
        shadow-radius={3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/* ---------- Extended Landscape: Large Ground Plane, Neighboring Fields, Dirt Track & Rolling Hills ---------- */
function makeFieldTexture({ base, stripe, stripes = 48, noiseAmt = 14, vertical = true }) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);

  // Furrow / crop row lines
  g.fillStyle = stripe;
  const step = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    const pos = i * step;
    if (vertical) g.fillRect(pos, 0, step * 0.48, 256);
    else g.fillRect(0, pos, 256, step * 0.48);
  }

  // Subtle organic soil/crop grain
  const img = g.getImageData(0, 0, 256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand(i * 0.25) - 0.5) * noiseAmt;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTrackTexture() {
  // Two dusty wheel ruts with a green grassy strip down the centre and edges (like reference image 1)
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");

  // Grass verge base
  g.fillStyle = "#5a9036";
  g.fillRect(0, 0, 128, 256);

  const drawRut = (cx) => {
    const grad = g.createLinearGradient(cx - 24, 0, cx + 24, 0);
    grad.addColorStop(0, "rgba(150, 126, 94, 0)");
    grad.addColorStop(0.25, "rgba(168, 142, 108, 0.92)");
    grad.addColorStop(0.5, "rgba(186, 162, 128, 0.98)");
    grad.addColorStop(0.75, "rgba(168, 142, 108, 0.92)");
    grad.addColorStop(1, "rgba(150, 126, 94, 0)");
    g.fillStyle = grad;
    g.fillRect(cx - 24, 0, 48, 256);
  };
  drawRut(36);
  drawRut(92);

  const img = g.getImageData(0, 0, 128, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand(i * 0.37) - 0.5) * 18;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHillsGeo() {
  // A wide terrain ring that stays flat near the farm and rises into rolling hills in the distance
  const g = new THREE.PlaneGeometry(240, 240, 96, 96);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lowCol = new THREE.Color("#5c9438");
  const midCol = new THREE.Color("#4a7e32");
  const peakCol = new THREE.Color("#3d6b34");
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);

    // Keep inner 32-unit radius flat so fields and tracks sit cleanly; rise beyond 32 units
    const ramp = THREE.MathUtils.smoothstep(dist, 30, 78);
    const wave1 = Math.sin(x * 0.055 + 0.8) * Math.cos(z * 0.055 - 0.4) * 7.5;
    const wave2 = Math.sin(x * 0.11 - z * 0.09 + 2.1) * 3.2;
    const ridge = Math.max(0, Math.sin(x * 0.03 + z * 0.025) * 5.5);
    const h = Math.max(0, (wave1 + wave2 + ridge + 4.2) * ramp);

    // Slight sink inside the flat zone so it never pokes through the main meadow plane at y = -0.03
    const y = ramp <= 0.001 ? -0.18 : h - 0.08;
    pos.setY(i, y);

    const t = THREE.MathUtils.clamp(y / 14, 0, 1);
    tmp.copy(lowCol).lerp(midCol, Math.min(1, t * 1.6)).lerp(peakCol, Math.max(0, t - 0.45));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Island() {
  const { meadowPbr } = useMemo(() => getPbrTextureSets(), []);
  const { ploughedTex, goldenTex, greenCropTex, pastureTex, trackTex, trackCrossTex, hillsGeo } = useMemo(() => {
    const ploughed = makeFieldTexture({
      base: "#5b3c24",
      stripe: "#472d19",
      stripes: 56,
      noiseAmt: 16,
      vertical: true,
    });
    const golden = makeFieldTexture({
      base: "#d4a84e",
      stripe: "#bc8f37",
      stripes: 64,
      noiseAmt: 18,
      vertical: true,
    });
    const greenCrop = makeFieldTexture({
      base: "#508a32",
      stripe: "#3f7325",
      stripes: 52,
      noiseAmt: 14,
      vertical: false,
    });
    const pasture = makeFieldTexture({
      base: "#689e3c",
      stripe: "#5c9034",
      stripes: 36,
      noiseAmt: 12,
      vertical: true,
    });
    const track = makeTrackTexture();
    const trackCross = makeTrackTexture();
    trackCross.repeat.set(1, 14);

    return {
      ploughedTex: ploughed,
      goldenTex: golden,
      greenCropTex: greenCrop,
      pastureTex: pasture,
      trackTex: track,
      trackCrossTex: trackCross,
      hillsGeo: makeHillsGeo(),
    };
  }, []);

  // Surrounding patchwork of neighboring fields (ploughed earth, golden wheat/stubble, lush green crops)
  const neighborFields = useMemo(
    () => [
      // Left of the dirt track: golden mature wheat/maize field (like left side of reference image 1)
      { pos: [-19.5, -0.015, -2], size: [22, 34], tex: goldenTex },
      // Right of the student's plot: large freshly ploughed dark-brown field (like right side of image 1)
      { pos: [19.0, -0.015, -2], size: [22, 34], tex: ploughedTex },
      // Beyond the back track: neighbouring green crop & golden harvest strips
      { pos: [-14, -0.015, -26], size: [24, 14], tex: greenCropTex },
      { pos: [13, -0.015, -26], size: [24, 14], tex: goldenTex },
      // Foreground / side fields
      { pos: [-18, -0.015, 23], size: [20, 14], tex: ploughedTex },
      { pos: [18, -0.015, 23], size: [20, 14], tex: greenCropTex },
      { pos: [0, -0.015, 24], size: [12, 14], tex: pastureTex },
      { pos: [0, -0.015, -26], size: [12, 14], tex: ploughedTex },
    ],
    [ploughedTex, goldenTex, greenCropTex, pastureTex]
  );

  return (
    <group>
      {/* Base continuous meadow ground plane with 512px PBR grass color, normal, and roughness maps */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial
          map={meadowPbr.map}
          normalMap={meadowPbr.normalMap}
          roughnessMap={meadowPbr.roughnessMap}
          roughness={0.95}
        />
      </mesh>

      {/* Rolling hills around the horizon (fading into the distance fog) */}
      <mesh geometry={hillsGeo} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.96} />
      </mesh>

      {/* Neighboring fields in ploughed brown, golden wheat, and lush green */}
      {neighborFields.map((f, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={f.pos} receiveShadow>
          <planeGeometry args={f.size} />
          <meshStandardMaterial map={f.tex} roughness={0.95} />
        </mesh>
      ))}

      {/* Dirt farm track with dual wheel ruts running alongside the plot (x = -6.8) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-6.8, -0.008, 0]} receiveShadow>
        <planeGeometry args={[2.1, 64]} />
        <meshStandardMaterial map={trackTex} roughness={0.94} />
      </mesh>

      {/* Cross dirt lane behind the plot & barn (z = -6.8) */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[2, -0.009, -6.8]} receiveShadow>
        <planeGeometry args={[1.9, 56]} />
        <meshStandardMaterial map={trackCrossTex} roughness={0.94} />
      </mesh>
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

/* ---------- High-altitude flat-shaded cumulus clouds ---------- */
const CLOUD_PUFF_TEMPLATES = [
  [0, 0.05, 0, 0.52],
  [0.42, 0.0, 0.14, 0.42],
  [-0.44, 0.0, -0.1, 0.44],
  [0.16, 0.18, -0.12, 0.38],
  [-0.18, 0.15, 0.18, 0.36],
  [0.68, -0.04, -0.08, 0.31],
  [-0.66, -0.04, 0.12, 0.33],
];

function Clouds() {
  const refs = useRef([]);
  const puffGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);

  const clouds = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const sd = i * 17 + 1;
        const puffCount = 4 + (i % 4); // 4–7 puffs of varied sizes clustered together
        const puffs = CLOUD_PUFF_TEMPLATES.slice(0, puffCount).map(([px, py, pz, pr], j) => ({
          pos: [
            px + (rand(sd + j * 3) - 0.5) * 0.12,
            py + rand(sd + j * 3 + 1) * 0.05,
            pz + (rand(sd + j * 3 + 2) - 0.5) * 0.12,
          ],
          r: pr * (0.9 + rand(sd + j * 5) * 0.22),
        }));
        const mat = new THREE.MeshLambertMaterial({
          color: "#f4f7fa",
          flatShading: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          fog: true,
        });
        return {
          x: (rand(sd) - 0.5) * 150,
          y: 35 + rand(sd + 1) * 15, // well above trees (2.4m) and camera max height (~20m)
          z: -15 - rand(sd + 2) * 75, // distributed high in the sky dome & horizon
          s: 2.2 + rand(sd + 3) * 1.4,
          speed: 0.35 + rand(sd + 4) * 0.25,
          puffs,
          mat,
        };
      }),
    []
  );

  useFrame((state, dt) => {
    const camPos = state.camera.position;
    clouds.forEach((c, i) => {
      c.x += c.speed * dt;
      if (c.x > 80) c.x = -80;
      const grp = refs.current[i];
      if (!grp) return;
      grp.position.set(c.x, c.y, c.z);

      // Safety net: fade any cloud if it ever gets near the camera
      const d = camPos.distanceTo(grp.position);
      const fade = THREE.MathUtils.smoothstep(d, 10, 30);
      c.mat.opacity = 0.85 * fade;
      grp.visible = fade > 0.02;
    });
  });

  return clouds.map((c, i) => (
    <group
      key={i}
      ref={(el) => (refs.current[i] = el)}
      position={[c.x, c.y, c.z]}
      scale={[c.s, c.s * 0.5, c.s]}
    >
      {c.puffs.map((p, j) => (
        <mesh
          key={j}
          geometry={puffGeo}
          material={c.mat}
          position={p.pos}
          scale={p.r}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  ));
}

/* ---------- Natural trees, bushes, rocks & grass (InstancedMesh + GPU wind) ---------- */

// Smooth spatial value noise so shared vertices move together without tearing
function noise3D(x, y, z, seed) {
  const s1 = Math.sin(x * 3.1 + y * 2.7 + z * 3.5 + seed * 17.3);
  const s2 = Math.cos(x * 5.3 - y * 4.1 + z * 2.9 + seed * 31.7);
  return (s1 + s2) * 0.5;
}

// Creates a lumpy, faceted low-poly foliage blob with vertical vertex-color gradient (darker bottom, sun-lit top)
function makeFoliageBlobGeo(radius, { sx = 1, sy = 1, sz = 1, lump = 0.18, seed = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const nz = vz / len;
    const d = 1 + noise3D(nx, ny, nz, seed) * lump;
    const fx = vx * d * sx;
    const fy = vy * d * sy;
    const fz = vz * d * sz;
    pos.setXYZ(i, fx, fy, fz);
    if (fy < minY) minY = fy;
    if (fy > maxY) maxY = fy;
  }

  const span = Math.max(0.001, maxY - minY);
  const colors = new Float32Array(pos.count * 3);
  const bot = new THREE.Color("#90a888"); // subtle shaded underside multiplier
  const top = new THREE.Color("#ffffff"); // bright sunlit crown multiplier
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    tmp.copy(bot).lerp(top, Math.pow(t, 0.75));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function makeRockGeo(radius = 0.24, seed = 7) {
  const g = new THREE.DodecahedronGeometry(radius, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const d = 1 + noise3D(vx * 3, vy * 3, vz * 3, seed) * 0.22;
    pos.setXYZ(i, vx * d * 1.15, Math.max(-0.02, vy * d * 0.72), vz * d);
  }
  g.computeVertexNormals();
  return g;
}

function makeGrassTuftGeo() {
  // Crossed thin arched triangular blades (2 intersecting tapered ribbons = 6 triangles per instance)
  // with root-to-tip vertex color gradient so roots look grounded and tips catch the sun.
  const pos = [];
  const col = [];
  const idx = [];

  const rootCol = new THREE.Color("#5c7d48"); // shaded earthy base
  const midCol = new THREE.Color("#b4dc92");
  const tipCol = new THREE.Color("#ffffff"); // bright sun-lit tip

  const blades = [
    { angle: 0, curve: 0.035, w: 0.038, h: 0.28 },
    { angle: Math.PI / 2, curve: -0.03, w: 0.036, h: 0.25 },
  ];

  blades.forEach((b, bi) => {
    const baseV = bi * 5;
    const ca = Math.cos(b.angle);
    const sa = Math.sin(b.angle);
    const hw = b.w * 0.5;
    const mhw = b.w * 0.28;

    const addV = (lx, ly, lz, c) => {
      const rx = lx * ca - lz * sa;
      const rz = lx * sa + lz * ca;
      pos.push(rx, ly, rz);
      col.push(c.r, c.g, c.b);
    };

    // 0, 1: bottom left & right at y = 0
    addV(-hw, 0, 0, rootCol);
    addV(hw, 0, 0, rootCol);
    // 2, 3: mid left & right at y = 0.52 * h
    addV(-mhw, b.h * 0.52, b.curve * 0.4, midCol);
    addV(mhw, b.h * 0.52, b.curve * 0.4, midCol);
    // 4: tapered tip at y = h
    addV(0, b.h, b.curve, tipCol);

    idx.push(
      baseV + 0, baseV + 1, baseV + 2,
      baseV + 1, baseV + 3, baseV + 2,
      baseV + 2, baseV + 3, baseV + 4
    );
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Shared GPU wind uniform updated once per frame
const windUniform = { value: 0 };

function makeWindFoliageMaterial(roughness = 0.88) {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    flatShading: true,
    vertexColors: true,
    roughness,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        float phase = wp.x * 0.9 + wp.z * 1.1;
        float hFactor = clamp(wp.y / 1.8, 0.0, 1.5);
        transformed.x += sin(uTime * 1.6 + phase) * 0.045 * hFactor;
        transformed.z += cos(uTime * 1.3 + phase * 1.3) * 0.035 * hFactor;
        #include <project_vertex>
        `
      );
  };
  return mat;
}

// Dedicated instanced grass material: double-sided crossed blades, tip-weighted wind waves, and distance fade-out
function makeInstancedGrassMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.86,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        // Smoothly shrink blades to zero between 18m and 28m from the farm centre
        float distFromCenter = length(wp.xz);
        float distFade = 1.0 - smoothstep(18.0, 28.0, distFromCenter);
        transformed *= distFade;

        // Wind bends only the upper blade (transformed.y > 0), keeping roots anchored at y = 0
        float tipWeight = clamp(transformed.y / 0.26, 0.0, 1.5);
        float gust = sin(uTime * 2.4 + wp.x * 0.75 + wp.z * 0.65)
                   + 0.45 * cos(uTime * 4.1 - wp.x * 1.3 + wp.z * 1.1);
        transformed.x += gust * 0.055 * tipWeight * tipWeight;
        transformed.z += gust * 0.038 * tipWeight * tipWeight;
        #include <project_vertex>
        `
      );
  };
  return mat;
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
    for (let i = 0; out.length < 28 && i < 400; i++) {
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

// Helper component to populate an InstancedMesh from a list of { matrix, color } transforms
function InstancedLayer({ geometry, material, instances, castShadow = true, receiveShadow = true }) {
  const ref = useRef();

  useEffect(() => {
    const m = ref.current;
    if (!m || !instances.length) return;
    const c = new THREE.Color();
    instances.forEach((it, idx) => {
      m.setMatrixAt(idx, it.matrix);
      if (it.color) {
        c.set(it.color);
        m.setColorAt(idx, c);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [geometry, instances]);

  if (!geometry || !instances.length) return null;
  return (
    <instancedMesh
      key={geometry.uuid}
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

function Scenery() {
  const [treeArchetypes, setTreeArchetypes] = useState(() => getDefaultTreeArchetypes());

  // Automatically load CC0 glTF models from /models/{acacia,eucalyptus,banana}.glb via GLTFLoader if present
  useEffect(() => {
    let active = true;
    loadOptionalGltfTreeArchetypes().then((loaded) => {
      if (active && loaded) {
        setTreeArchetypes((prev) => ({ ...prev, ...loaded }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useFrame((state) => {
    windUniform.value = state.clock.elapsedTime;
  });

  // Shared geometries & materials across all instances (minimal draw calls for classroom hardware)
  const assets = useMemo(() => {
    const bushBlobGeo = makeFoliageBlobGeo(0.28, { sx: 1.15, sy: 0.85, sz: 1.1, lump: 0.24, seed: 29 });
    const rockGeo = makeRockGeo(0.2, 41);
    const grassGeo = makeGrassTuftGeo();

    const foliageMat = makeWindFoliageMaterial(0.86);
    const grassMat = makeInstancedGrassMaterial();
    const trunkMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      vertexColors: true,
      roughness: 0.94,
    });
    const rockMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.92 });

    return {
      bushBlobGeo,
      rockGeo,
      grassGeo,
      foliageMat,
      grassMat,
      trunkMat,
      rockMat,
    };
  }, []);

  // Poisson-disc style natural clustering + per-species instance matrices for Acacia, Eucalyptus & Banana
  const layers = useMemo(() => {
    const acaciaBark = [];
    const acaciaFoliage = [];
    const eucalyptusBark = [];
    const eucalyptusFoliage = [];
    const bananaBark = [];
    const bananaFoliage = [];
    const bushBlobs = [];
    const rocks = [];
    const grassTufts = [];

    const dummy = new THREE.Object3D();
    const child = new THREE.Object3D();
    const color = new THREE.Color();

    const jitterGreen = (baseHex, seed, hSpan = 0.04, sSpan = 0.08, lSpan = 0.07) => {
      color.set(baseHex);
      color.offsetHSL(
        (rand(seed) - 0.5) * hSpan,
        (rand(seed + 1) - 0.5) * sSpan,
        (rand(seed + 2) - 0.5) * lSpan
      );
      return `#${color.getHexString()}`;
    };

    // Subtle near-white tint multiplier so baked vertex colors on each tree archetype get per-tree variation
    const jitterTint = (seed, hSpan = 0.04, sSpan = 0.12, lSpan = 0.12) => {
      color.setHSL(
        0.28 + (rand(seed) - 0.5) * hSpan,
        0.18 + rand(seed + 1) * sSpan,
        0.92 + (rand(seed + 2) - 0.5) * lSpan
      );
      return `#${color.getHexString()}`;
    };

    const jitterBarkTint = (seed) => {
      color.setHSL(0.08, 0.1 + rand(seed) * 0.1, 0.9 + (rand(seed + 1) - 0.5) * 0.12);
      return `#${color.getHexString()}`;
    };

    const addTreeInstance = (speciesKey, x, z, sx, sy, sz, yaw, leanX, leanZ, sd) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(leanX, yaw, leanZ);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      const mat = dummy.matrix.clone();
      const bTint = jitterBarkTint(sd);
      const fTint = jitterTint(sd + 7);

      if (speciesKey === "acacia") {
        acaciaBark.push({ matrix: mat, color: bTint });
        acaciaFoliage.push({ matrix: mat, color: fTint });
      } else if (speciesKey === "eucalyptus") {
        eucalyptusBark.push({ matrix: mat, color: bTint });
        eucalyptusFoliage.push({ matrix: mat, color: fTint });
      } else {
        bananaBark.push({ matrix: mat, color: bTint });
        bananaFoliage.push({ matrix: mat, color: fTint });
      }
    };

    const halfIsland = GROUND_SIZE / 2 - 0.45;
    const minBed = FRAME_OUT + 0.55;
    const placed = [];

    const canPlace = (x, z, minDist) => {
      if (Math.abs(x) > halfIsland || Math.abs(z) > halfIsland) return false;
      if (Math.max(Math.abs(x), Math.abs(z)) < minBed) return false;
      if (Math.hypot(x - BARN.x, z - BARN.z) < 1.5) return false;
      return placed.every((p) => Math.hypot(x - p.x, z - p.z) >= minDist);
    };

    // 1a. Homestead Banana Grove ("Ndizi") clustered near the barn & moist plot corners (classic Kenyan shamba)
    const bananaSpots = [
      { x: -3.1, z: -4.7, s: 1.05 },
      { x: -2.55, z: -4.45, s: 0.82 },
      { x: -4.85, z: -2.95, s: 1.1 },
      { x: -4.5, z: -2.35, s: 0.86 },
      { x: 4.15, z: -4.35, s: 1.02 },
      { x: 4.65, z: -3.75, s: 0.84 },
      { x: -4.45, z: 3.85, s: 0.96 },
    ];
    bananaSpots.forEach((b, idx) => {
      const sd = idx * 29 + 101;
      placed.push({ x: b.x, z: b.z, r: 0.58 });
      const s = b.s * (0.92 + rand(sd) * 0.18);
      const sy = s * (0.94 + rand(sd + 1) * 0.16);
      const yaw = rand(sd + 2) * Math.PI * 2;
      const leanX = (rand(sd + 3) - 0.5) * 0.08;
      const leanZ = (rand(sd + 4) - 0.5) * 0.08;
      addTreeInstance("banana", b.x, b.z, s, sy, s, yaw, leanX, leanZ, sd);
    });

    // 1b. Place Acacia & Eucalyptus trees around the plot perimeter via Poisson-disc rejection
    for (let attempt = 0; attempt < 360 && placed.length < 18; attempt++) {
      const sd = attempt * 13 + 5;
      const x = (rand(sd) - 0.5) * 2 * halfIsland;
      const z = (rand(sd + 1) - 0.5) * 2 * halfIsland;
      // Keep the front camera corner (x + z > 2.2) open so the maize plots stay unobstructed
      if (x + z > 2.2) continue;
      if (!canPlace(x, z, 1.15)) continue;

      placed.push({ x, z, r: 0.65 });
      const roll = attempt % 3;
      const speciesKey = roll === 0 ? "acacia" : roll === 1 ? "eucalyptus" : "banana";
      const s = 0.82 + rand(sd + 2) * 0.42;
      const sy = s * (0.92 + rand(sd + 3) * 0.2);
      const yaw = rand(sd + 4) * Math.PI * 2;
      const leanX = (rand(sd + 5) - 0.5) * 0.09;
      const leanZ = (rand(sd + 6) - 0.5) * 0.09;

      addTreeInstance(speciesKey, x, z, s, sy, s, yaw, leanX, leanZ, sd);
    }

    // 2. Scatter low bushes in the gaps and along the front/side borders
    let bushCount = 0;
    for (let attempt = 0; attempt < 300 && bushCount < 16; attempt++) {
      const sd = attempt * 19 + 401;
      const x = (rand(sd) - 0.5) * 2 * halfIsland;
      const z = (rand(sd + 1) - 0.5) * 2 * halfIsland;
      if (!canPlace(x, z, 0.72)) continue;

      placed.push({ x, z, r: 0.4 });
      bushCount++;
      const bs = 0.75 + rand(sd + 2) * 0.55;
      const yaw = rand(sd + 3) * Math.PI * 2;

      const puffs = [
        { ox: 0, oy: 0.22, oz: 0, sc: 1.05 },
        { ox: 0.2, oy: 0.16, oz: 0.12, sc: 0.82 },
        { ox: -0.18, oy: 0.15, oz: -0.11, sc: 0.76 },
      ];
      puffs.forEach((pf, k) => {
        child.position.set(x + pf.ox * bs, pf.oy * bs, z + pf.oz * bs);
        child.rotation.set(rand(sd + 10 + k) * 0.4, yaw + k * 1.4, rand(sd + 20 + k) * 0.4);
        child.scale.set(bs * pf.sc, bs * pf.sc * 0.88, bs * pf.sc);
        child.updateMatrix();
        bushBlobs.push({
          matrix: child.matrix.clone(),
          color: jitterGreen("#439e37", sd + 30 + k, 0.05, 0.1, 0.08),
        });
      });
    }

    // 3. Scatter low-poly field stones/rocks in the gaps
    let rockCount = 0;
    for (let attempt = 0; attempt < 220 && rockCount < 12; attempt++) {
      const sd = attempt * 23 + 901;
      const x = (rand(sd) - 0.5) * 2 * halfIsland;
      const z = (rand(sd + 1) - 0.5) * 2 * halfIsland;
      if (!canPlace(x, z, 0.55)) continue;

      placed.push({ x, z, r: 0.25 });
      rockCount++;
      const rs = 0.65 + rand(sd + 2) * 0.75;
      child.position.set(x, 0.06 * rs, z);
      child.rotation.set((rand(sd + 3) - 0.5) * 0.3, rand(sd + 4) * Math.PI * 2, (rand(sd + 5) - 0.5) * 0.3);
      child.scale.set(rs * (0.9 + rand(sd + 6) * 0.35), rs * 0.75, rs);
      child.updateMatrix();
      color.set("#8c857b").offsetHSL(0, 0, (rand(sd + 7) - 0.5) * 0.12);
      rocks.push({ matrix: child.matrix.clone(), color: `#${color.getHexString()}` });
    }

    // 4. Instanced Grass (~9,000 crossed-blade tufts in a single draw call):
    //    - Dense around the planting bed borders (FRAME_OUT)
    //    - Dense along both verges and center median of the dirt tracks (x ≈ -6.8 and z ≈ -6.8)
    //    - Sparse across the open meadow, tapering off and skipping beyond 26m
    const addGrassBlade = (x, z, wScale, hScale, sd, baseHex = "#57a639") => {
      // Skip inside the cultivated planting bed or inside the barn footprint
      if (Math.max(Math.abs(x), Math.abs(z)) < FRAME_OUT + 0.06) return;
      if (Math.hypot(x - BARN.x, z - BARN.z) < 0.95) return;
      // Skip in the bare wheel ruts of the dirt track (x = -7.35 or -6.25)
      if (Math.abs(z) < 28 && (Math.abs(x - -7.35) < 0.24 || Math.abs(x - -6.25) < 0.24)) return;

      const yaw = rand(sd) * Math.PI * 2;
      const tiltX = (rand(sd + 1) - 0.5) * 0.18;
      const tiltZ = (rand(sd + 2) - 0.5) * 0.18;
      child.position.set(x, 0, z);
      child.rotation.set(tiltX, yaw, tiltZ);
      child.scale.set(wScale, hScale, wScale);
      child.updateMatrix();
      grassTufts.push({
        matrix: child.matrix.clone(),
        color: jitterGreen(baseHex, sd + 3, 0.06, 0.12, 0.1),
      });
    };

    // 4a. Dense grass collar hugging the wooden planting bed border (3,200 instances)
    for (let i = 0; i < 3200; i++) {
      const sd = i * 11 + 1301;
      // Square-ring parameter around the bed frame with exponential falloff outward
      const side = i % 4;
      const along = (rand(sd) - 0.5) * 2 * (FRAME_OUT + 1.4);
      const outDist = FRAME_OUT + 0.08 + Math.pow(rand(sd + 1), 1.7) * 2.2;
      let x = 0;
      let z = 0;
      if (side === 0) { x = along; z = outDist; }
      else if (side === 1) { x = along; z = -outDist; }
      else if (side === 2) { x = outDist; z = along; }
      else { x = -outDist; z = along; }

      // Taller, lusher grass right against the timber edge
      const edgeBoost = 1.35 - Math.min(0.55, (outDist - FRAME_OUT) * 0.25);
      const wScale = (0.85 + rand(sd + 2) * 0.5) * edgeBoost;
      const hScale = (0.75 + rand(sd + 3) * 0.85) * edgeBoost;
      addGrassBlade(x, z, wScale, hScale, sd + 4, "#58a838");
    }

    // 4b. Dense long grass along the main dirt track verges & center median (3,000 instances)
    for (let i = 0; i < 3000; i++) {
      const sd = i * 17 + 41001;
      const band = i % 5;
      let x;
      if (band === 0) {
        // Center grassy strip between the two wheel ruts
        x = -6.8 + (rand(sd) - 0.5) * 0.42;
      } else if (band === 1 || band === 2) {
        // Left verge bordering the golden wheat field
        x = -7.68 - Math.pow(rand(sd), 1.5) * 1.35;
      } else {
        // Right verge bordering the student's farm plot
        x = -5.92 + Math.pow(rand(sd), 1.5) * 1.35;
      }
      const z = (rand(sd + 1) - 0.5) * 44;
      // Fade density & height beyond 16m along the track
      if (Math.abs(z) > 16 && rand(sd + 2) > 1 - (Math.abs(z) - 16) / 10) continue;

      const wScale = 0.95 + rand(sd + 3) * 0.55;
      const hScale = 1.05 + rand(sd + 4) * 1.05; // tall unmown trackside grass
      addGrassBlade(x, z, wScale, hScale, sd + 5, "#5ca038");
    }

    // 4c. Dense grass along the back cross-track verge & hedgerow line (1,200 instances)
    for (let i = 0; i < 1200; i++) {
      const sd = i * 19 + 95001;
      const side = i % 2 === 0 ? -1 : 1;
      const z = -6.8 + side * (0.82 + Math.pow(rand(sd), 1.5) * 1.2);
      const x = (rand(sd + 1) - 0.5) * 38;
      if (Math.abs(x) > 16 && rand(sd + 2) > 0.45) continue;
      const wScale = 0.9 + rand(sd + 3) * 0.5;
      const hScale = 0.95 + rand(sd + 4) * 0.95;
      addGrassBlade(x, z, wScale, hScale, sd + 5, "#549c36");
    }

    // 4d. Sparse meadow & field-margin grass out to 25m (1,800 instances; skipped beyond 25m)
    for (let i = 0; i < 1800; i++) {
      const sd = i * 23 + 135001;
      const angle = rand(sd) * Math.PI * 2;
      const radius = FRAME_OUT + 1.8 + Math.pow(rand(sd + 1), 0.85) * 18.5;
      if (radius > 25) continue;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Keep out of the ploughed brown field on the right (x > 8, |z| < 18) except right along its border
      if (x > 8.6 && Math.abs(z) < 17.5) continue;

      const wScale = 0.8 + rand(sd + 2) * 0.55;
      const hScale = 0.65 + rand(sd + 3) * 0.75;
      addGrassBlade(x, z, wScale, hScale, sd + 4, "#5aa63a");
    }

    // 5. Distant Kenyan treelines, Eucalyptus windbreaks & Acacia savannah trees framing the horizon fields
    const addDistantTree = (x, z, sd, scaleMul = 1.3, preferredSpecies = null) => {
      const roll = rand(sd);
      const speciesKey =
        preferredSpecies || (roll < 0.44 ? "acacia" : roll < 0.82 ? "eucalyptus" : "banana");
      const s = (0.95 + rand(sd + 1) * 0.55) * scaleMul;
      const sy = s * (0.9 + rand(sd + 2) * 0.22);
      const yaw = rand(sd + 3) * Math.PI * 2;
      const leanX = (rand(sd + 4) - 0.5) * 0.06;
      const leanZ = (rand(sd + 5) - 0.5) * 0.06;
      addTreeInstance(speciesKey, x, z, s, sy, s, yaw, leanX, leanZ, sd + 10);
    };

    // Dense woodland treeline along the far horizon & flanking field boundaries
    for (let i = 0; i < 72; i++) {
      const sd = i * 37 + 3101;
      const angle = (i / 72) * Math.PI * 2 + (rand(sd) - 0.5) * 0.08;
      const radius = 27 + rand(sd + 1) * 11;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      addDistantTree(x, z, sd, 1.3 + rand(sd + 2) * 0.45);
    }

    // Mid-ground Kenyan windbreak & hedgerow along the back dirt lane (z ≈ -8.6):
    // Tall Eucalyptus windbreaks interspersed with Acacia and Banana clusters
    for (let i = 0; i < 20; i++) {
      const sd = i * 41 + 5101;
      const x = -26 + i * 2.8 + (rand(sd) - 0.5) * 0.9;
      if (Math.abs(x - BARN.x) < 2.5) continue;
      const z = -8.6 - rand(sd + 1) * 2.1;
      const species = i % 3 === 0 ? "eucalyptus" : i % 3 === 1 ? "acacia" : "banana";
      addDistantTree(x, z, sd, 1.05 + rand(sd + 2) * 0.28, species);
    }

    return {
      acaciaBark,
      acaciaFoliage,
      eucalyptusBark,
      eucalyptusFoliage,
      bananaBark,
      bananaFoliage,
      bushBlobs,
      rocks,
      grassTufts,
    };
  }, []);

  return (
    <group>
      {/* Kenyan Umbrella Thorn Acacia (bark + wind-swayed foliage) */}
      <InstancedLayer
        geometry={treeArchetypes.acacia.barkGeo}
        material={assets.trunkMat}
        instances={layers.acaciaBark}
      />
      <InstancedLayer
        geometry={treeArchetypes.acacia.foliageGeo}
        material={assets.foliageMat}
        instances={layers.acaciaFoliage}
      />

      {/* Kenyan Blue Gum / Eucalyptus (pale bark + tall tiered wind-swayed crown) */}
      <InstancedLayer
        geometry={treeArchetypes.eucalyptus.barkGeo}
        material={assets.trunkMat}
        instances={layers.eucalyptusBark}
      />
      <InstancedLayer
        geometry={treeArchetypes.eucalyptus.foliageGeo}
        material={assets.foliageMat}
        instances={layers.eucalyptusFoliage}
      />

      {/* Kenyan Banana / Ndizi (pseudostem + broad arching wind-swayed fronds) */}
      <InstancedLayer
        geometry={treeArchetypes.banana.barkGeo}
        material={assets.trunkMat}
        instances={layers.bananaBark}
      />
      <InstancedLayer
        geometry={treeArchetypes.banana.foliageGeo}
        material={assets.foliageMat}
        instances={layers.bananaFoliage}
      />

      {/* Ground cover: low bushes, field rocks, and ~9,200 instanced grass blades */}
      <InstancedLayer geometry={assets.bushBlobGeo} material={assets.foliageMat} instances={layers.bushBlobs} />
      <InstancedLayer geometry={assets.rockGeo} material={assets.rockMat} instances={layers.rocks} />
      <InstancedLayer
        geometry={assets.grassGeo}
        material={assets.grassMat}
        instances={layers.grassTufts}
        castShadow={false}
      />
    </group>
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