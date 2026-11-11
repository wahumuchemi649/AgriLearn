import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useFarmStore } from "./useFarmStore";
import { stageId, stageName } from "../api/farm";
import { emit } from "./Effects";
import { sfx } from "./sound";
import { player, input, useWalkStore, BOUNDS, OBSTACLES, clamp } from "./playerState";
import { getStations, inside, toolForName } from "./stationdata";

const WALK = 3.4;
const RUN = 6.4;

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

/** The farmer you control: WASD / arrows / joystick, Shift to run. */
export function Player() {
  const g = useRef();
  const lean = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();
  const blade = useRef();
  const bag = useRef();
  const basket = useRef();
  const stations = useRef({ plots: null, list: [] });
  const amp = useRef(0);
  const dust = useRef(0);

  useEffect(() => {
    const down = (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      input.keys.add(k);
      if (k.startsWith("arrow")) e.preventDefault();
    };
    const up = (e) => input.keys.delete(e.key.toLowerCase());
    const clear = () => input.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      input.keys.clear();
    };
  }, []);

  useFrame((state, rawDt) => {
    const grp = g.current;
    if (!grp) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const keys = input.keys;
    const farm = useFarmStore.getState();

    if (stations.current.plots !== farm.plots) {
      stations.current = { plots: farm.plots, list: getStations(farm.plots) };
    }
    const list = stations.current.list;

    // Camera turning
    if (keys.has("q")) player.camYaw -= dt * 1.8;
    if (keys.has("r")) player.camYaw += dt * 1.8;

    // Are we in the middle of a job?
    if (farm.busy) {
      player.workT = 1;
      const a = farm.actions.find((s) => stageId(s) === farm.pendingStageId);
      if (a) player.tool = toolForName(stageName(a));
    } else {
      player.workT = Math.max(0, player.workT - dt);
    }
    const working = player.workT > 0;

    // Input vector (x = right, y = forward)
    let ix = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    let iy = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    let mag = Math.min(1, Math.hypot(ix, iy));
    let run = keys.has("shift");
    if (input.joyActive) {
      ix += input.joy.x;
      iy += input.joy.y;
      mag = Math.min(1, Math.hypot(ix, iy));
      run = run || mag > 0.8;
    }

    let moving = false;
    if (!working && mag > 0.06) {
      const sy = Math.sin(player.camYaw);
      const cy = Math.cos(player.camYaw);
      // camera forward = (-sin, -cos), camera right = (cos, -sin)
      let mx = -sy * iy + cy * ix;
      let mz = -cy * iy - sy * ix;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;

      const speed = (run ? RUN : WALK) * (input.joyActive ? Math.max(0.5, mag) : 1);
      let nx = player.x + mx * speed * dt;
      let nz = player.z + mz * speed * dt;
      for (const o of OBSTACLES) {
        const dx = nx - o.x;
        const dz = nz - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + 0.25;
        if (d < min && d > 0.0001) {
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
        }
      }
      player.x = clamp(nx, -BOUNDS.x, BOUNDS.x);
      player.z = clamp(nz, -BOUNDS.z, BOUNDS.z);

      const target = Math.atan2(mx, mz);
      let d = target - player.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.heading += d * Math.min(1, dt * 12);
      player.speed = speed;
      player.running = run;
      moving = true;

      dust.current += dt;
      if (run && dust.current > 0.09) {
        dust.current = 0;
        emit({
          x: player.x, z: player.z, y: 0.22, count: 2, spread: 0.25, speed: 0.8, up: 1,
          gravity: 6, size: 0.05, life: 0.45, colors: ["#d9c7a0", "#b8a47c"],
        });
      }
    } else {
      player.speed = 0;
      player.running = false;
    }

    // Which work area are we standing in?
    const near = list.find((s) => inside(s, player.x, player.z));
    const nearId = near ? near.id : null;
    const walk = useWalkStore.getState();
    if (walk.nearId !== nearId) {
      walk.setNear(nearId);
      if (nearId) sfx.tick();
    }

    // While working, turn to face the middle of the work area
    if (working && near) {
      const target = Math.atan2(near.x - player.x, near.z - player.z);
      let d = target - player.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.heading += d * Math.min(1, dt * 8);
    }

    // ---- Pose ----
    amp.current += ((moving ? 1 : 0) - amp.current) * Math.min(1, dt * 10);
    const ph = t * (run ? 16 : 11);
    const sw = Math.sin(ph) * amp.current;
    grp.position.set(player.x, 0.2 + Math.abs(sw) * 0.07, player.z);
    grp.rotation.y = player.heading;
    lean.current.rotation.x += ((moving && run ? 0.2 : 0) - lean.current.rotation.x) * Math.min(1, dt * 8);

    legL.current.rotation.x = sw * 0.85;
    legR.current.rotation.x = -sw * 0.85;
    if (working) {
      const swing = Math.sin(t * 14);
      const big = player.tool === "blade";
      armR.current.rotation.x = big ? -2.0 + swing * 0.7 : -1.0 + swing * 0.25;
      armL.current.rotation.x = big ? -1.6 + swing * 0.6 : -0.8 - swing * 0.2;
    } else {
      armR.current.rotation.x = -sw * 0.75 * (run ? 1.3 : 1);
      armL.current.rotation.x = sw * 0.75 * (run ? 1.3 : 1);
    }
    blade.current.visible = working && player.tool === "blade";
    bag.current.visible = working && player.tool === "bag";
    basket.current.visible = working && player.tool === "basket";
  });

  const skin = "#c68642";
  return (
    <group ref={g} position={[player.x, 0.2, player.z]} scale={1.25}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.26, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>
      <group ref={lean}>
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[0.32, 0.4, 0.2]} />
          <meshStandardMaterial color="#c8503c" />
        </mesh>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.33, 0.1, 0.21]} />
          <meshStandardMaterial color="#6a4a2a" />
        </mesh>
        <mesh position={[0, 0.92, 0]} castShadow>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, 1.0, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.03, 12]} />
          <meshStandardMaterial color="#e9cf7a" />
        </mesh>
        <mesh position={[0, 1.06, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.13, 0.1, 10]} />
          <meshStandardMaterial color="#e9cf7a" />
        </mesh>
        <group ref={legL} position={[-0.08, 0.38, 0]}>
          <mesh position={[0, -0.17, 0]} castShadow>
            <boxGeometry args={[0.11, 0.34, 0.11]} />
            <meshStandardMaterial color="#35507a" />
          </mesh>
        </group>
        <group ref={legR} position={[0.08, 0.38, 0]}>
          <mesh position={[0, -0.17, 0]} castShadow>
            <boxGeometry args={[0.11, 0.34, 0.11]} />
            <meshStandardMaterial color="#35507a" />
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
          {/* hoe / machete */}
          <group ref={blade} visible={false}>
            <mesh position={[0, -0.5, 0]} castShadow>
              <cylinderGeometry args={[0.014, 0.014, 0.7, 6]} />
              <meshStandardMaterial color="#8a5a30" />
            </mesh>
            <mesh position={[0, -0.86, 0.06]} castShadow>
              <boxGeometry args={[0.04, 0.05, 0.2]} />
              <meshStandardMaterial color="#b9c0c8" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
          {/* seed / fertilizer sack */}
          <group ref={bag} visible={false}>
            <mesh position={[0, -0.36, 0.1]} castShadow>
              <capsuleGeometry args={[0.1, 0.14, 4, 8]} />
              <meshStandardMaterial color="#b99a62" />
            </mesh>
          </group>
          {/* basket for cobs and grain */}
          <group ref={basket} visible={false}>
            <mesh position={[0, -0.34, 0.12]} castShadow>
              <cylinderGeometry args={[0.13, 0.1, 0.12, 10]} />
              <meshStandardMaterial color="#a8763c" />
            </mesh>
            <mesh position={[0, -0.28, 0.12]}>
              <cylinderGeometry args={[0.11, 0.11, 0.02, 10]} />
              <meshStandardMaterial color="#f2c230" />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}