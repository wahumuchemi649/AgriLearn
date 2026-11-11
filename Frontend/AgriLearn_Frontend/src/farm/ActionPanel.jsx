import { useState } from "react";
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

const DEFAULT_TOTAL_STAGES = 18;

export default function ActionPanel() {
  const cycle = useFarmStore((s) => s.cycle);
  const actions = useFarmStore((s) => s.actions);
  const busy = useFarmStore((s) => s.busy);
  const pendingStageId = useFarmStore((s) => s.pendingStageId);
  const performAction = useFarmStore((s) => s.performAction);
  const paused = useFarmStore((s) => Boolean(s.cycle?.is_paused));

  const [active, setActive] = useState(null); // stage awaiting form input
  const [values, setValues] = useState({});
  const [showAllSteps, setShowAllSteps] = useState(false);

  if (!cycle) return null;

  const fields = active ? INPUTS[stageType(active)] ?? [] : [];

  // Derive total & completed step counts so the thin progress stepper stays accurate
  const maxOrder = actions.reduce(
    (max, a, idx) => Math.max(max, Number(a.sequence_order ?? a.order ?? idx + 1)),
    DEFAULT_TOTAL_STAGES
  );
  const totalSteps = Math.max(DEFAULT_TOTAL_STAGES, actions.length, maxOrder);
  const completedSteps = Math.max(0, totalSteps - actions.length);
  const currentStepNumber = Math.min(totalSteps, completedSteps + 1);

  // Current actionable step (first enabled stage, or first remaining stage)
  const currentStage = actions.find((a) => stageEnabled(a)) ?? actions[0] ?? null;
  const currentIdx = currentStage ? actions.indexOf(currentStage) : -1;
  const upNextStage = currentIdx >= 0 && currentIdx + 1 < actions.length ? actions[currentIdx + 1] : null;

  function handleStageClick(stage) {
    if (!stage) return;
    if (INPUTS[stageType(stage)]) {
      setValues({});
      setActive(stage);
      setShowAllSteps(false);
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

  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 w-[560px] max-w-[94vw]">
      {/* Expandable "View all steps" drawer */}
      {!active && showAllSteps && actions.length > 0 && (
        <div className="mb-1.5 rounded-2xl border border-gray-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              All Remaining Steps ({actions.length})
            </span>
            <button
              type="button"
              onClick={() => setShowAllSteps(false)}
              className=" inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <span>Close</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {actions.map((a) => {
              const isCurrent = currentStage && stageId(a) === stageId(currentStage);
              const enabled = stageEnabled(a);
              return (
                <button
                  key={stageId(a)}
                  type="button"
                  disabled={busy || paused || !enabled}
                  onClick={() => handleStageClick(a)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent && enabled
                      ? "bg-green-600 text-white shadow-sm hover:bg-green-700"
                      : enabled
                      ? "bg-green-50 text-green-800 ring-1 ring-green-600/30 hover:bg-green-100"
                      : "cursor-not-allowed bg-gray-100 text-gray-400"
                  }`}
                >
                  {pendingStageId === stageId(a) ? "Working..." : stageName(a)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Docked bottom bar */}
      <div className="rounded-t-2xl border-t border-x border-gray-200/90 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur">
        {active ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">{stageName(active)}</h2>
              <span className="text-xs text-gray-500">
                Step {currentStepNumber} of {totalSteps}
              </span>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="block text-xs font-medium text-gray-700">
                  {f.label}
                  <input
                    type={f.type}
                    value={values[f.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-green-600 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || paused}
                onClick={handleSubmit}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
              >
                {busy ? "Working..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-lg bg-gray-100 px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-gray-700">
              All {totalSteps} farming steps complete!
            </span>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
              100%
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Thin progress stepper (segmented dots/bar) + step counter + View all steps expander */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">
                  Step {currentStepNumber} of {totalSteps}
                </span>
                {upNextStage && (
                  <span className="hidden text-xs text-gray-400 sm:inline">
                    · Next: {stageName(upNextStage)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAllSteps((v) => !v)}
                aria-expanded={showAllSteps}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50"
              >
                <span>{showAllSteps ? "Hide all steps" : `View all steps (${actions.length})`}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 transition-transform ${showAllSteps ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            </div>

            {/* Thin segmented progress stepper */}
            <div
              className="flex items-center gap-1"
              role="progressbar"
              aria-valuenow={completedSteps}
              aria-valuemin={0}
              aria-valuemax={totalSteps}
              aria-label={`Farming progress: ${completedSteps} of ${totalSteps} completed`}
            >
              {Array.from({ length: totalSteps }, (_, idx) => {
                const isDone = idx < completedSteps;
                const isCurrent = idx === completedSteps;
                return (
                  <span
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      isDone
                        ? "bg-green-600"
                        : isCurrent
                        ? "bg-green-400 ring-2 ring-green-600/30"
                        : "bg-gray-200"
                    }`}
                  />
                );
              })}
            </div>

            {/* Single prominent button for the current step */}
            {currentStage && (
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-gray-500">Current action</div>
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {stageName(currentStage)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || paused || !stageEnabled(currentStage)}
                  onClick={() => handleStageClick(currentStage)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  <span>
                    {pendingStageId === stageId(currentStage)
                      ? "Working..."
                      : stageName(currentStage)}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
