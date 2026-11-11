import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useFarmStore } from "./useFarmStore";
import { stageEnabled, stageName } from "../api/farm";
import { useWalkStore } from "./playerState";
import { getStations, STATION_INFO, stationIdForName } from "./stationdata";

const Y = 0.31;

function Station({ st, target }) {
  const info = STATION_INFO[st.id];
  const chev = useRef();
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
    []
  );
  const labelY = st.id === "field" ? 2.6 : 2.0;

  useFrame(({ clock }) => {
    const { nearId, pulse } = useWalkStore.getState();
    const near = nearId === st.id;
    const t = clock.elapsedTime;
    const ping = Math.max(0, 1 - (Date.now() - pulse) / 1200);
    if (target) {
      mat.color.set(near ? "#5ad06a" : "#ffd166");
      mat.opacity = 0.6 + 0.3 * Math.sin(t * 4) + ping * 0.3;
    } else {
      mat.color.set(near ? "#8be28f" : "#ffffff");
      mat.opacity = near ? 0.6 : 0.28;
    }
    if (chev.current) chev.current.position.y = labelY + 0.55 + Math.sin(t * 3) * 0.15;
  });

  const W = st.maxX - st.minX;
  const D = st.maxZ - st.minZ;
  const BAR = 0.09;

  return (
    <group>
      {st.kind === "rect" ? (
        <>
          <mesh material={mat} position={[st.x, Y, st.minZ]}>
            <boxGeometry args={[W, 0.02, BAR]} />
          </mesh>
          <mesh material={mat} position={[st.x, Y, st.maxZ]}>
            <boxGeometry args={[W, 0.02, BAR]} />
          </mesh>
          <mesh material={mat} position={[st.minX, Y, st.z]}>
            <boxGeometry args={[BAR, 0.02, D]} />
          </mesh>
          <mesh material={mat} position={[st.maxX, Y, st.z]}>
            <boxGeometry args={[BAR, 0.02, D]} />
          </mesh>
        </>
      ) : (
        <mesh material={mat} position={[st.x, Y, st.z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[st.r - 0.09, st.r, 48]} />
        </mesh>
      )}

      <Html position={[st.x, labelY, st.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow ${
            target ? "bg-amber-400 text-gray-900" : "bg-white/80 text-gray-700"
          }`}
        >
          {info.icon} {info.label}
        </div>
      </Html>

      {target && (
        <mesh ref={chev} position={[st.x, labelY + 0.55, st.z]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.26, 0.5, 4]} />
          <meshBasicMaterial color="#ffd166" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Glowing outlines and labels for the places where work happens. */
export function Stations() {
  const plots = useFarmStore((s) => s.plots);
  const actions = useFarmStore((s) => s.actions);
  const cycle = useFarmStore((s) => s.cycle);
  const stations = useMemo(() => getStations(plots), [plots]);

  const guided = String(cycle?.mode ?? "").toLowerCase() === "guided";
  const current = actions.filter(stageEnabled)[0];
  const targetId = guided && current ? stationIdForName(stageName(current)) : null;

  useEffect(() => {
    useWalkStore.getState().setTarget(targetId);
  }, [targetId]);

  return (
    <>
      {stations.map((st) => (
        <Station key={st.id} st={st} target={st.id === targetId} />
      ))}
    </>
  );
}