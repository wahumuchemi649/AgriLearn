import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { useParams, Link } from "react-router-dom";
import { useFarmStore, PLOT_SIZE } from "../farm/useFarmStore";
import ActionPanel from "../farm/ActionPanel";
import { World } from "../farm/World";
import { FieldBushes, Worker, MaizeField, Furrows, useFieldProgress } from "../farm/FieldVisuals";
import { Particles, CameraRig, StageFx } from "../farm/Effects";
import { getPbrTextureSets } from "../farm/pbrTextures";
import { sfx, isMuted, setMuted } from "../farm/sound";
import { cycleHealth, cycleHealthState, cycleDay, cycleState, isPaused } from "../api/farm";
import TutorDrawer from "./TutorDrawer";

// Soil & grass state tints multiplied over the 512px PBR albedo, normal, and roughness maps:
// - Untilled weedy grass: neutral white multiplier so the grassy PBR map shows its true greens
// - Tilled coarse soil: warm Kenyan loam brown
// - Moist / watered / nourished soil (planted or fertilized in healthy state): darker, richer damp earth with lower roughness
// - Dry / stressed soil (health < 60 or late harvest drying): sun-baked lighter dusty earth with high roughness
const GRASS_TINT = "#ffffff";
const TILLED_SOIL_TINT = "#8c5832";
const MOIST_SOIL_TINT = "#59351c";
const DRY_SOIL_TINT = "#b58356";

function Plot({ id, position }) {
  const [hovered, setHovered] = useState(false);
  const isSelected = useFarmStore((s) => s.selectedPlotId === id);
  const selectPlot = useFarmStore((s) => s.selectPlot);
  const cycle = useFarmStore((s) => s.cycle);
  const { tilled, furrowed, planted, fertilized } = useFieldProgress();
  const pbr = useMemo(() => getPbrTextureSets(), []);

  const hp = Number(cycle?.current_health_score ?? 100);
  const day = Number(cycle?.virtual_day ?? 0);
  const isDry = tilled && (hp < 60 || day >= 125); // Stressed/stunted crop or late-season drying stage
  const isMoist = tilled && !isDry && (planted || fertilized); // Damp, well-tended seedbed

  const targetHex = !tilled
    ? GRASS_TINT
    : isDry
    ? DRY_SOIL_TINT
    : isMoist
    ? MOIST_SOIL_TINT
    : TILLED_SOIL_TINT;

  const targetRoughness = !tilled ? 0.92 : isDry ? 0.98 : isMoist ? 0.68 : 0.88;
  const activePbr = !tilled ? pbr.grassPbr : furrowed ? pbr.furrowedSoilPbr : pbr.tilledSoilPbr;

  const mesh = useRef();
  const mat = useRef();
  const initialColor = useRef(targetHex).current;
  const target = useMemo(() => new THREE.Color(targetHex), [targetHex]);

  // Swap between grass PBR, cloddy ploughed PBR, and ridged furrow PBR when cultivation stages complete
  useEffect(() => {
    if (!mat.current) return;
    mat.current.map = activePbr.map;
    mat.current.normalMap = activePbr.normalMap;
    mat.current.roughnessMap = activePbr.roughnessMap;
    mat.current.normalScale.set(furrowed ? 1.35 : 1.0, furrowed ? 1.35 : 1.0);
    mat.current.needsUpdate = true;
  }, [activePbr, furrowed]);

  useFrame(() => {
    // Soil color and moisture roughness blend smoothly as farming stages and health change
    if (mat.current) {
      mat.current.color.lerp(target, 0.08);
      mat.current.roughness += (targetRoughness - mat.current.roughness) * 0.08;
    }
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
    <RoundedBox
      ref={mesh}
      args={[PLOT_SIZE, 0.2, PLOT_SIZE]}
      radius={0.06}
      smoothness={3}
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
      <meshStandardMaterial
        ref={mat}
        map={activePbr.map}
        normalMap={activePbr.normalMap}
        roughnessMap={activePbr.roughnessMap}
        roughness={targetRoughness}
        color={initialColor}
        emissive="#ffd27a"
        emissiveIntensity={isSelected ? 0.35 : hovered ? 0.18 : 0}
      />
      {furrowed && <Furrows />}
    </RoundedBox>
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

function ErrorToast() {
  const error = useFarmStore((s) => s.error);
  const clearError = useFarmStore((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => clearError(), 4500);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-medium text-amber-900 shadow-xl backdrop-blur"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0 text-amber-600"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{error}</span>
      <button
        type="button"
        onClick={clearError}
        aria-label="Dismiss notification"
        className="ml-1 rounded-full p-1 text-amber-700 hover:bg-amber-200/60 hover:text-amber-950"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
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
    <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{lastEvent.name} done</span>
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
  const cameraView = useFarmStore((s) => s.cameraView);
  const setCameraView = useFarmStore((s) => s.setCameraView);

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
        shadows="percentage"
        frameloop={isPaused(cycle) ? "never" : "always"}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        camera={{ fov: 48, near: 0.1, far: 1000, position: [10.2, 10.6, 10.2] }}
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
      <ErrorToast />

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <button
          onClick={() => {
            const m = !muted;
            setMuted(m);
            setMutedState(m);
          }}
          className="rounded-full bg-white/90 px-3 py-2 text-sm shadow hover:bg-white"
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <Link
  to="/home"
  className="absolute top-16 left-4 rounded-full bg-white/90 px-3 py-2 text-sm shadow hover:bg-white"
>
  ← Home
</Link>

        <div
          role="group"
          aria-label="Camera view"
          className="flex items-center rounded-full bg-white/90 p-1 text-xs font-semibold shadow backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setCameraView("overview")}
            aria-pressed={cameraView === "overview"}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              cameraView === "overview"
                ? "bg-green-600 text-white shadow-sm"
                : "text-gray-700 hover:text-gray-950"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setCameraView("field")}
            aria-pressed={cameraView === "field"}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              cameraView === "field"
                ? "bg-green-600 text-white shadow-sm"
                : "text-gray-700 hover:text-gray-950"
            }`}
          >
            Field view (30°)
          </button>
        </div>
      </div>

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
      State: <b>{isPaused(cycle) ? "Paused" : String(cycleState(cycle) ?? "-")}</b>
    </div>
    {String(cycleState(cycle)).toLowerCase() === "active" && !isPaused(cycle) && (
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
      <TutorDrawer cycleId={Number(cycleId)} />
    </div>
  );
}