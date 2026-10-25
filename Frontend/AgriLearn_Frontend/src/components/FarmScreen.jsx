import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useParams, Link } from "react-router-dom";
import { useFarmStore, PLOT_SIZE } from "../farm/useFarmStore";
import ActionPanel from "../farm/ActionPanel";
import { World } from "../farm/World";
import { FieldBushes, Worker, MaizeField, Furrows, useFieldProgress } from "../farm/FieldVisuals";
import { Particles, CameraRig, StageFx } from "../farm/Effects";
import { sfx, isMuted, setMuted } from "../farm/sound";
import { cycleHealth, cycleHealthState, cycleDay, cycleState } from "../api/farm";


const WEEDY = "#5f7f35";
const SOIL = "#8b5a2b";

function Plot({ id, position }) {
  const [hovered, setHovered] = useState(false);
  const isSelected = useFarmStore((s) => s.selectedPlotId === id);
  const selectPlot = useFarmStore((s) => s.selectPlot);
  const { tilled, furrowed } = useFieldProgress();

  const mesh = useRef();
  const mat = useRef();
  const initialColor = useRef(tilled ? SOIL : WEEDY).current;
  const target = useMemo(() => new THREE.Color(tilled ? SOIL : WEEDY), [tilled]);

  useFrame(() => {
    // Soil blends smoothly when cultivated; the tile lifts when hovered or selected
    mat.current?.color.lerp(target, 0.08);
    if (mesh.current) {
      const y = position[1] + (hovered || isSelected ? 0.06 : 0);
      mesh.current.position.y += (y - mesh.current.position.y) * 0.25;
    }
  });

  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  return (
    <mesh
      ref={mesh}
      position={position}
      receiveShadow
      castShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        sfx.tick();
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        selectPlot(id);
      }}
    >
      <boxGeometry args={[PLOT_SIZE, 0.2, PLOT_SIZE]} />
      <meshStandardMaterial
        ref={mat}
        color={initialColor}
        emissive="#ffd27a"
        emissiveIntensity={isSelected ? 0.55 : hovered ? 0.3 : 0}
      />
      {furrowed && <Furrows />}
    </mesh>
  );
}

function PlotGrid() {
  const plots = useFarmStore((s) => s.plots);
  return (
    <>
      {plots.map((p) => (
        <Plot key={p.id} id={p.id} position={p.position} />
      ))}
    </>
  );
}

function EventToast() {
  const lastEvent = useFarmStore((s) => s.lastEvent);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastEvent) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [lastEvent]);

  if (!lastEvent || !visible) return null;
  return (
    <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg">
      {lastEvent.name} done ✓
    </div>
  );
}

export default function FarmScene() {
  const { cycleId } = useParams();
  const clearSelection = useFarmStore((s) => s.clearSelection);
  const loadCycle = useFarmStore((s) => s.loadCycle);
  const refreshCycle = useFarmStore((s) => s.refreshCycle);
  const loading = useFarmStore((s) => s.loading);
  const error = useFarmStore((s) => s.error);
  const cycle = useFarmStore((s) => s.cycle);
  const [muted, setMutedState] = useState(isMuted());
  const togglePause = useFarmStore((s) => s.togglePause);
  const busy = useFarmStore((s) => s.busy);

  useEffect(() => {
    loadCycle(cycleId);
  }, [cycleId, loadCycle]);
  

  useEffect(() => {
    const id = setInterval(refreshCycle, 3000);
    return () => clearInterval(id);
  }, [refreshCycle]);

  return (
    <div className="relative w-screen h-screen">
      <Canvas
        orthographic
        shadows="percentage"
        frameloop={cycle?.is_paused ? "never" : "always"}
        camera={{ near: 0.1, far: 1000 }}
        onPointerMissed={clearSelection}
       >
        <CameraRig />
        <World />
        <PlotGrid />
        <FieldBushes />
        <Worker />
        <MaizeField />
        <Particles />
        <StageFx />
      </Canvas>

      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 px-4 py-2 rounded-lg shadow text-sm">
          Loading farm...
        </div>
      )}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow text-sm max-w-[90vw]">
          {error}
        </div>
      )}

      <button
        onClick={() => {
          const m = !muted;
          setMuted(m);
          setMutedState(m);
        }}
        className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-2 text-sm shadow hover:bg-white"
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {cycle && (
  <div className="absolute top-4 right-4 bg-white/90 rounded-xl shadow px-4 py-3 text-sm text-gray-800">
    <div>
      Day: <b>{Math.floor(Number(cycleDay(cycle)) || 0)}</b>
    </div>
    <div>
      Health: <b>{cycleHealth(cycle) ?? "-"}</b>
      {cycleHealthState(cycle) && ` (${cycleHealthState(cycle)})`}
    </div>
    <div>
      State: <b>{cycle.is_paused ? "Paused" : String(cycleState(cycle) ?? "-")}</b>
    </div>
    {String(cycleState(cycle)).toLowerCase() === "active" && !cycle.is_paused && (
      <button
        onClick={togglePause}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:bg-gray-400"
      >
        ⏸ Pause
      </button>
    )}
  </div>
)}
    {cycle &&
  !["active", "paused"].includes(String(cycleState(cycle)).toLowerCase()) && (
    <Link
      to={`/farm/${cycleId}/debrief`}
      className="absolute top-4 left-20 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700"
    >
      Cycle finished · See your debrief →
    </Link>
  )}
      {cycle?.is_paused && (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/40 backdrop-blur-[2px]">
    <div className="text-5xl">⏸</div>
    <h2 className="text-2xl font-bold text-white">Farm paused</h2>
    <p className="text-sm text-white/80">Time is stopped. Your crops will wait for you.</p>
    <button
      onClick={togglePause}
      disabled={busy}
      className="mt-2 rounded-xl bg-green-600 px-8 py-3 font-semibold text-white shadow-lg hover:bg-green-700 disabled:bg-gray-400"
    >
      {busy ? "Resuming..." : "▶ Continue"}
    </button>
  </div>
)}
      <EventToast />
      <ActionPanel />
    </div>
  );
}