import { useEffect, useRef, useState } from "react";
import { useFarmStore } from "./useFarmStore";
import { useGrowth } from "./FieldVisuals";
import { useStageFlags, JOURNEY } from "./UseStageflags";
import { player, input, useWalkStore } from "./playerState";
import { getStations, distanceTo, STATION_INFO } from "./stationdata";

const GROWTH_STAGES = [
  [0.08, "🌱 Germinating"],
  [0.25, "🌿 Seedling"],
  [0.55, "🌾 Vegetative growth"],
  [0.72, "🌽 Tasseling & silking"],
  [0.95, "🌽 Grain filling"],
  [1.01, "🟡 Mature, ready to harvest"],
];

const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

/* ---------- Where to go next ---------- */
function Objective() {
  const targetId = useWalkStore((s) => s.targetId);
  const nearId = useWalkStore((s) => s.nearId);
  const required = useWalkStore((s) => s.required);
  const setRequired = useWalkStore((s) => s.setRequired);
  const [nav, setNav] = useState({ dist: 0, rel: 0 });

  useEffect(() => {
    if (!targetId) return;
    const id = setInterval(() => {
      const st = getStations(useFarmStore.getState().plots).find((s) => s.id === targetId);
      if (!st) return;
      const bearing = Math.atan2(st.x - player.x, st.z - player.z);
      const camForward = player.camYaw + Math.PI;
      setNav({ dist: distanceTo(st, player.x, player.z), rel: camForward - bearing });
    }, 120);
    return () => clearInterval(id);
  }, [targetId]);

  const info = targetId ? STATION_INFO[targetId] : null;
  const atTarget = targetId && nearId === targetId;

  return (
    <div className="absolute left-4 top-16 max-w-[11rem] rounded-2xl bg-white/80 px-3 py-2 text-xs text-gray-700 shadow backdrop-blur sm:max-w-xs">
      {info ? (
        atTarget ? (
          <div className="font-semibold text-green-700">
            ✓ You're at the {info.label}. Press E or tap “Do this step”.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="inline-block text-lg leading-none text-amber-600"
              style={{ transform: `rotate(${nav.rel}rad)` }}
            >
              ⬆
            </span>
            <span>
              Go to the <b>{info.label}</b> · {nav.dist.toFixed(0)} m
            </span>
          </div>
        )
      ) : (
        <div>{nearId ? `📍 ${STATION_INFO[nearId].label}` : "Walk into a glowing work area to start a job."}</div>
      )}
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Walk to the work area
      </label>
    </div>
  );
}

/* ---------- Crop progress card ---------- */
function CropCard() {
  const { growth, day, plantedDay } = useGrowth();
  const { done, pending } = useStageFlags();

  let label = "Land preparation";
  if (done.plant) {
    label = GROWTH_STAGES.find(([max]) => growth < max)?.[1] ?? "🟡 Mature";
    if (done.harvest) label = "🧺 Harvested";
    if (done.shell) label = "🌽 Grain shelled";
    if (done.dry) label = "☀️ Grain dried";
    if (done.store) label = "📦 Stored";
  }
  const firstPending = JOURNEY.find((j) => !done[j.key] && pending[j.key])?.key;
  const pct = Math.round(growth * 100);
  const age =
    Number.isFinite(day) && plantedDay !== null && plantedDay !== undefined
      ? Math.max(0, Math.floor(day - plantedDay))
      : null;

  return (
    <div className="absolute right-4 top-16 w-44 rounded-2xl bg-white/80 p-3 text-xs text-gray-700 shadow backdrop-blur sm:w-56">
      <div className="font-semibold text-gray-900">{label}</div>
      {done.plant && !done.harvest && (
        <>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-gray-500">
            <span>Crop growth {pct}%</span>
            {age !== null && <span>{age} days old</span>}
          </div>
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {JOURNEY.map((j) => (
          <span
            key={j.key}
            title={j.label}
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
              done[j.key]
                ? "bg-green-600/90"
                : j.key === firstPending
                ? "bg-amber-300 ring-2 ring-amber-500"
                : "bg-gray-200 opacity-60"
            }`}
          >
            {j.icon}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Touch joystick (push far to run) ---------- */
function Joystick() {
  const base = useRef();
  const knob = useRef();
  const active = useRef(null);
  const R = 48;

  const set = (e) => {
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    input.joy.x = dx / R;
    input.joy.y = -dy / R;
    input.joyActive = true;
  };
  const end = () => {
    active.current = null;
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    input.joy.x = 0;
    input.joy.y = 0;
    input.joyActive = false;
  };

  return (
    <div
      ref={base}
      className="absolute bottom-[270px] right-5 z-20 flex h-32 w-32 touch-none select-none items-center justify-center rounded-full border border-white/70 bg-white/30 backdrop-blur sm:bottom-10"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        set(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && set(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="h-14 w-14 rounded-full bg-white/80 shadow" />
    </div>
  );
}

export default function WalkHud() {
  const [touch] = useState(isTouch);
  return (
    <>
      <Objective />
      <CropCard />
      {touch && <Joystick />}
      {!touch && (
        <div className="pointer-events-none absolute bottom-4 right-4 hidden rounded-xl bg-black/45 px-3 py-2 text-[11px] leading-relaxed text-white sm:block">
          <b>WASD</b> / arrows move · <b>Shift</b> run · <b>E</b> do the step
          <br />
          <b>Q / R</b> or drag to turn the camera · scroll to zoom
        </div>
      )}
    </>
  );
}