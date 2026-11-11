import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFarmStore } from "./useFarmStore";
import { useStageFlags } from "./useStageFlags";
import { useFieldProgress, useGrowth, PLANT_OFFSET } from "./FieldVisuals";

const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const SPOTS = [
  [-PLANT_OFFSET, -PLANT_OFFSET],
  [PLANT_OFFSET, -PLANT_OFFSET],
  [-PLANT_OFFSET, PLANT_OFFSET],
  [PLANT_OFFSET, PLANT_OFFSET],
];

const BARN = { x: 4.0, z: -2.2 }; // cob pile
const YARD = { x: 6.0, z: 0.9 }; // drying tarp

/** Many small props in one draw call. `level` (0..1) grows or shrinks them smoothly. */
function Swarm({ items, level, color, geometry }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const k = useRef(0);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    k.current += (level - k.current) * Math.min(1, dt * 5);
    const v = k.current;
    m.visible = v > 0.01;
    if (!m.visible) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx ?? 0, it.r ?? 0, it.rz ?? 0);
      dummy.scale.set(Math.max(v, 0.0001), Math.max(v * (it.sy ?? 1), 0.0001), Math.max(v, 0.0001));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, items.length]} frustumCulled={false} castShadow>
      {geometry}
      <meshStandardMaterial color={color} roughness={0.9} />
    </instancedMesh>
  );
}

/** Everything that shows how the field changes: pegs, weeds, fertilizer, harvest, grain. */
export function FieldExtras() {
  const plots = useFarmStore((s) => s.plots);
  const { done, pending } = useStageFlags();
  const { planted } = useFieldProgress();
  const { growth } = useGrowth();

  const pegs = useMemo(
    () =>
      plots.flatMap((p) =>
        SPOTS.map(([dx, dz]) => ({ x: p.position[0] + dx, y: 0.37, z: p.position[2] + dz }))
      ),
    [plots]
  );
  const pegFlags = useMemo(() => pegs.map((p) => ({ ...p, y: 0.5, r: 0.4 })), [pegs]);

  const weeds = useMemo(
    () =>
      plots.flatMap((p) =>
        Array.from({ length: 7 }, (_, i) => {
          const sd = p.id * 13 + i + 900;
          return {
            x: p.position[0] + (rand(sd) - 0.5) * 1.5,
            y: 0.3,
            z: p.position[2] + (rand(sd + 1) - 0.5) * 1.5,
            sy: 1.2 + rand(sd + 2) * 0.9,
            r: rand(sd + 3) * 6,
          };
        })
      ),
    [plots]
  );

  const pellets = useMemo(
    () =>
      plots.flatMap((p) =>
        SPOTS.flatMap(([dx, dz], s) =>
          Array.from({ length: 5 }, (_, i) => {
            const a = i * 1.2566 + s;
            return {
              x: p.position[0] + dx + Math.cos(a) * 0.17,
              y: 0.215,
              z: p.position[2] + dz + Math.sin(a) * 0.17,
            };
          })
        )
      ),
    [plots]
  );

  const cobs = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: BARN.x + (rand(i + 70) - 0.5) * 0.8,
        y: 0.3 + Math.floor(i / 6) * 0.09,
        z: BARN.z + (rand(i + 90) - 0.5) * 0.5,
        rz: Math.PI / 2,
        r: rand(i + 50) * 3,
      })),
    []
  );

  const kernels = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        x: YARD.x + (rand(i + 300) - 0.5) * 1.35,
        y: 0.3,
        z: YARD.z + (rand(i + 400) - 0.5) * 0.95,
        sy: 0.55,
      })),
    []
  );

  const sacks = useMemo(
    () => [
      { x: 4.45, y: 0.44, z: -1.75 },
      { x: 4.8, y: 0.44, z: -1.7 },
      { x: 5.15, y: 0.44, z: -1.75 },
      { x: 4.62, y: 0.72, z: -1.72 },
      { x: 4.98, y: 0.72, z: -1.72 },
    ],
    []
  );

  const weedLevel = planted && pending.weed && !done.harvest ? clamp01(0.35 + growth * 2) : 0;

  return (
    <>
      {/* land marking: wooden pegs with red tape at every planting spot */}
      <Swarm items={pegs} level={done.mark && !planted ? 1 : 0} color="#8a5a30" geometry={<boxGeometry args={[0.04, 0.34, 0.04]} />} />
      <Swarm items={pegFlags} level={done.mark && !planted ? 1 : 0} color="#d6402f" geometry={<boxGeometry args={[0.14, 0.07, 0.02]} />} />

      {/* weeds grow between the plants until you weed */}
      <Swarm items={weeds} level={weedLevel} color="#9cc23c" geometry={<icosahedronGeometry args={[0.15, 0]} />} />

      {/* fertilizer pellets around each plant */}
      <Swarm items={pellets} level={done.fertil && !done.harvest ? 1 : 0} color="#efeadb" geometry={<sphereGeometry args={[0.022, 6, 5]} />} />

      {/* harvested cobs pile up by the barn until they are shelled */}
      <Swarm items={cobs} level={done.harvest && !done.shell ? 1 : 0} color="#d6bd5a" geometry={<capsuleGeometry args={[0.05, 0.2, 4, 8]} />} />

      {/* drying yard: a tarp that fills with grain once shelled, turning amber as it dries */}
      <mesh position={[YARD.x, 0.27, YARD.z]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1.7, 1.25]} />
        <meshStandardMaterial color="#3d78b8" roughness={0.95} />
      </mesh>
      <Swarm
        items={kernels}
        level={done.shell ? 1 : 0}
        color={done.dry ? "#c98a1c" : "#f2c230"}
        geometry={<sphereGeometry args={[0.055, 8, 6]} />}
      />

      {/* dried grain bagged and stacked at the barn door */}
      <Swarm items={sacks} level={done.dry ? 1 : 0} color="#b99a62" geometry={<capsuleGeometry args={[0.13, 0.22, 4, 10]} />} />
    </>
  );
}