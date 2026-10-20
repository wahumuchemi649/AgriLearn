import { useLayoutEffect, useState, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useFarmStore, PLOT_SIZE } from "../farm/useFarmStore";
import { useParams } from "react-router-dom";
import ActionPanel from "../farm/ActionPanel";

function IsoCamera() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.position.set(10, 10, 10);
    camera.zoom = 60;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
      />
    </>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[14, 14]} />
      <meshStandardMaterial color="#6aa84f" />
    </mesh>
  );
}

function Plot({ id, position }) {
  const [hovered, setHovered] = useState(false);
  const isSelected = useFarmStore((s) => s.selectedPlotId === id);
  const hasCycle = useFarmStore((s) => s.cycle !== null);
  const selectPlot = useFarmStore((s) => s.selectPlot);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  let color = "#8b5a2b";
  if (hovered) color = "#b07a45";
  if (isSelected) color = "#d9a066";

  return (
    <mesh
      position={position}
      receiveShadow
      castShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
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
      <boxGeometry args={[PLOT_SIZE, isSelected ? 0.3 : 0.2, PLOT_SIZE]} />
      <meshStandardMaterial color={color} />

      {hasCycle && (
        <mesh position={[0, 0.32, 0]} castShadow>
          <coneGeometry args={[0.25, 0.4, 8]} />
          <meshStandardMaterial color="#3f9b3f" />
        </mesh>
      )}
    </mesh>
  );
}
function PlotGrid() {
  const plots = useFarmStore((state) => state.plots);

  return (
    <>
      {plots.map((plot) => (
        <Plot key={plot.id} id={plot.id} position={plot.position} />
      ))}
    </>
  );
}
export default function FarmScene() {
  const { cycleId } = useParams();
  const clearSelection = useFarmStore((s) => s.clearSelection);
  const loadCycle = useFarmStore((s) => s.loadCycle);
  const loading = useFarmStore((s) => s.loading);
  const error = useFarmStore((s) => s.error);
  const cycle = useFarmStore((s) => s.cycle);

  useEffect(() => {
    loadCycle(cycleId);
  }, [cycleId, loadCycle]);

  return (
    <div className="relative w-screen h-screen">
      <Canvas
        orthographic
        shadows
        camera={{ near: 0.1, far: 1000 }}
        onPointerMissed={clearSelection}
      >
        <color attach="background" args={["#cfe8ff"]} />
        <IsoCamera />
        <Lights />
        <Ground />
        <PlotGrid />
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

      {/* TEMPORARY: shows the raw cycle state so we can see its real shape */}
      {cycle && (
        <pre className="absolute top-4 left-4 max-h-[40vh] max-w-[320px] overflow-auto bg-black/70 text-green-200 text-xs p-3 rounded-lg">
          {JSON.stringify(cycle, null, 2)}
        </pre>
      )}

      <ActionPanel />
    </div>
  );
}