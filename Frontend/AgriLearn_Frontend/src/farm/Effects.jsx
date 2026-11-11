import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFarmStore } from "./useFarmStore";
import { sfx } from "./sound";

const MAX = 500;

// Shared effect queue: any component can call emit() or addShake()
export const fx = { queue: [], shake: 0 };
export const emit = (o) => fx.queue.push(o);
export const addShake = (v) => {
  fx.shake = Math.min(1.2, Math.max(fx.shake, v));
};

export function Particles() {
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const pool = useMemo(
    () => ({ next: 0, list: Array.from({ length: MAX }, () => ({ alive: false })) }),
    []
  );

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 0.05);

    while (fx.queue.length) {
      const o = fx.queue.shift();
      for (let i = 0; i < o.count; i++) {
        const idx = pool.next;
        pool.next = (pool.next + 1) % MAX;
        const p = pool.list[idx];
        const a = Math.random() * Math.PI * 2;
        const sp = (o.speed ?? 2) * (0.3 + Math.random() * 0.9);
        p.alive = true;
        p.age = 0;
        p.life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
        p.x = o.x + (Math.random() - 0.5) * (o.spread ?? 0.4);
        p.y = o.y ?? 0.3;
        p.z = o.z + (Math.random() - 0.5) * (o.spread ?? 0.4);
        p.vx = Math.cos(a) * sp;
        p.vz = Math.sin(a) * sp;
        p.vy = (o.up ?? 3) * (0.5 + Math.random() * 0.9);
        p.g = o.gravity ?? 9;
        p.size = (o.size ?? 0.1) * (0.6 + Math.random() * 0.8);
        p.rot = Math.random() * 6;
        p.vr = (Math.random() - 0.5) * 12;
        const cs = o.colors ?? [o.color ?? "#ffffff"];
        color.set(cs[(Math.random() * cs.length) | 0]);
        m.setColorAt(idx, color);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < MAX; i++) {
      const p = pool.list[i];
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
        } else {
          p.vy -= p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.12) {
            p.y = 0.12;
            p.vy = 0;
            p.vx *= 0.9;
            p.vz *= 0.9;
          }
          p.rot += p.vr * dt;
        }
      }
      if (p.alive) {
        const k = 1 - p.age / p.life;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rot, p.rot * 0.7, 0);
        dummy.scale.setScalar(p.size * Math.min(1, k * 2.5));
      } else {
        dummy.position.set(0, -50, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.0001);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 0.6, 0.35]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// Perspective camera presets:
// - "overview": elevated diorama angle (~46° above ground) showing the entire island
// - "field": closer, low-angle field view (~30° above ground: atan2(4.5, 7.8) ≈ 30°)
const CAMERA_VIEWS = {
  overview: {
    pos: new THREE.Vector3(10.2, 10.6, 10.2),
    target: new THREE.Vector3(0, 0.25, 0),
  },
  field: {
    pos: new THREE.Vector3(5.5, 4.5, 5.5),
    target: new THREE.Vector3(0, 0.55, 0),
  },
};

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef(null);
  const cameraView = useFarmStore((s) => s.cameraView);
  const transitioning = useRef(false);
  const desiredPos = useRef(CAMERA_VIEWS.overview.pos.clone());
  const desiredTarget = useRef(CAMERA_VIEWS.overview.target.clone());

  // Start a smooth glide whenever the user switches between Overview and Field view
  useEffect(() => {
    const preset = CAMERA_VIEWS[cameraView] ?? CAMERA_VIEWS.overview;
    desiredPos.current.copy(preset.pos);
    desiredTarget.current.copy(preset.target);
    transitioning.current = true;
  }, [cameraView]);

  useFrame((_, dt) => {
    const ctrl = controlsRef.current;
    const step = Math.min(1, dt * 6);

    if (transitioning.current && ctrl) {
      camera.position.lerp(desiredPos.current, step);
      ctrl.target.lerp(desiredTarget.current, step);
      if (
        camera.position.distanceTo(desiredPos.current) < 0.05 &&
        ctrl.target.distanceTo(desiredTarget.current) < 0.03
      ) {
        transitioning.current = false;
      }
    }

    // Screen shake for chopping/digging impact
    if (fx.shake > 0) {
      fx.shake = Math.max(0, fx.shake - dt * 2.2);
      const s = fx.shake * fx.shake * 0.12;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y = Math.max(1.2, camera.position.y + (Math.random() - 0.5) * s);
    }

    // Clamp target inside the farm bed so panning can't lose the island
    if (ctrl) {
      ctrl.target.x = THREE.MathUtils.clamp(ctrl.target.x, -3.5, 3.5);
      ctrl.target.y = THREE.MathUtils.clamp(ctrl.target.y, 0.1, 1.8);
      ctrl.target.z = THREE.MathUtils.clamp(ctrl.target.z, -3.5, 3.5);
      ctrl.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={5.5}
      maxDistance={22}
      minPolarAngle={Math.PI * 0.12} // ~21° from top-down zenith
      maxPolarAngle={Math.PI * 0.42} // ~14° above horizon — never goes under the ground
      onStart={() => {
        // Cancel preset glide if the student drags the camera manually
        transitioning.current = false;
      }}
    />
  );
}

// Reacts to a completed stage with the right effect and sound
export function StageFx() {
  const lastEvent = useFarmStore((s) => s.lastEvent);
  const plots = useFarmStore((s) => s.plots);

  useEffect(() => {
    if (!lastEvent) return;
    const n = lastEvent.name.toLowerCase();

    if (n.includes("bush")) {
      sfx.whoosh(); // the worker handles the rest
      return;
    }
    if (n.includes("planting")) return; // seeds handle their own effects

    if (n.includes("cultivation") || n.includes("secondary")) {
      sfx.dig();
      addShake(0.5);
      plots.forEach((p) =>
        emit({
          x: p.position[0], z: p.position[2], y: 0.3,
          count: 14, spread: 1.4, speed: 1.5, up: 2.5, size: 0.09, life: 0.9,
          colors: ["#6b4423", "#8b5a2b", "#4a2c12"],
        })
      );
      return;
    }

    // Any other stage: a golden sparkle over the field and a ding
    sfx.ding();
    plots.forEach((p) =>
      emit({
        x: p.position[0], z: p.position[2], y: 0.4,
        count: 8, spread: 1.2, speed: 0.8, up: 2, gravity: 3, size: 0.07, life: 1.3,
        colors: ["#fff3b0", "#ffd166"],
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  return null;
}