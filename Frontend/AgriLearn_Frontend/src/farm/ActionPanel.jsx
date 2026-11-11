import { useRef, useState } from "react";
import { useFarmStore } from "./useFarmStore";
import { stageId, stageName, stageType, stageEnabled } from "../api/farm";

// Which inputs each action_type asks for
const INPUTS = {
  SPACING_DECISION: [
    { key: "row_spacing_cm", label: "Row spacing (cm)", type: "number" },
    { key: "column_spacing_cm", label: "Column spacing (cm)", type: "number" },
  ],
  PLANTING: [
    { key: "seeds_per_hole", label: "Seeds per hole", type: "number" },
  ],
  FERTILIZER_APPLICATION: [
    { key: "fertilizer_name", label: "Fertilizer name", type: "text" },
    { key: "application_rate", label: "Application rate", type: "number" },
  ],
};

// Tells the tutor drawer to open with this question filled in
const askTutor = (question) =>
  window.dispatchEvent(new CustomEvent("tutor:ask", { detail: { question } }));

function Progress({ done, total }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>Step {Math.min(done + 1, total)} of {total}</span>
        <span>{pct}% done</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ActionPanel() {
  const cycle = useFarmStore((s) => s.cycle);
  const actions = useFarmStore((s) => s.actions);
  const busy = useFarmStore((s) => s.busy);
  const pendingStageId = useFarmStore((s) => s.pendingStageId);
  const performAction = useFarmStore((s) => s.performAction);
  const paused = useFarmStore((s) => Boolean(s.cycle?.is_paused));

  const [active, setActive] = useState(null); // stage awaiting input
  const [values, setValues] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // The API only returns remaining stages, so remember the biggest list we have seen
  const maxSeen = useRef(0);
  maxSeen.current = Math.max(maxSeen.current, actions.length);

  if (!cycle) return null;

  const guided = String(cycle.mode ?? "").toLowerCase() === "guided";
  const total = cycle.total_stages ?? maxSeen.current;
  const done = Math.max(0, total - actions.length);
  const enabled = actions.filter(stageEnabled);
  const current = enabled[0];
  const upcoming = actions.filter((a) => current && stageId(a) !== stageId(current));
  const fields = active ? INPUTS[stageType(active)] ?? [] : [];

  function handleStageClick(stage) {
    if (INPUTS[stageType(stage)]) {
      setValues({});
      setActive(stage);
    } else {
      performAction(stage);
    }
  }

  async function handleSubmit() {
    const extras = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === undefined || raw === "") continue;
      extras[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    await performAction(active, extras);
    // Keep the form open if the server rejected it, so nothing typed is lost
    if (!useFarmStore.getState().error) setActive(null);
  }

  const askAbout = (stage) =>
    askTutor(`Explain the "${stageName(stage)}" stage and why it matters.`);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl bg-white/95 p-4 shadow-lg sm:bottom-4 sm:left-4 sm:right-auto sm:w-[360px] sm:rounded-xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">
          {active ? stageName(active) : guided ? "Your next step" : "Choose a stage"}
        </h2>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Show steps" : "Hide steps"}
          className="rounded px-2 text-lg leading-none text-gray-500 hover:bg-gray-100"
        >
          {collapsed ? "▴" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <>
          <Progress done={done} total={total} />

          {active ? (
            <>
              <div className="mb-4 space-y-3">
                {fields.map((f) => (
                  <label key={f.key} className="block text-sm text-gray-700">
                    {f.label}
                    <input
                      type={f.type}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy || paused}
                  onClick={handleSubmit}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
                >
                  {busy ? "Working..." : "Confirm"}
                </button>
                <button
                  onClick={() => setActive(null)}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => askAbout(active)}
                  className="ml-auto text-sm font-medium text-green-700 hover:underline"
                >
                  💬 Ask about this
                </button>
              </div>
            </>
          ) : actions.length === 0 ? (
            <p className="text-sm text-gray-500">All steps done. Cycle complete.</p>
          ) : guided ? (
            <>
              {current && (
                <div className="rounded-xl border-2 border-green-600 bg-green-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-green-700">Now</div>
                  <div className="text-lg font-semibold text-green-900">{stageName(current)}</div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      disabled={busy || paused}
                      onClick={() => handleStageClick(current)}
                      className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {pendingStageId === stageId(current) ? "Working..." : "Do this step"}
                    </button>
                    <button
                      onClick={() => askAbout(current)}
                      className="text-sm font-medium text-green-700 hover:underline"
                    >
                      💬 Ask about this
                    </button>
                  </div>
                </div>
              )}
              {upcoming.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Up next: {upcoming.slice(0, 3).map(stageName).join(" → ")}
                  {upcoming.length > 3 && ` (+${upcoming.length - 3} more)`}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {(showAll ? actions : enabled).map((a) => (
                  <button
                    key={stageId(a)}
                    disabled={busy || paused || !stageEnabled(a)}
                    onClick={() => handleStageClick(a)}
                    className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {pendingStageId === stageId(a) ? "Working..." : stageName(a)}
                  </button>
                ))}
              </div>
              {actions.length > enabled.length && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="mt-2 text-xs text-gray-500 hover:underline"
                >
                  {showAll ? "Hide locked stages" : `Show ${actions.length - enabled.length} locked stages`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}