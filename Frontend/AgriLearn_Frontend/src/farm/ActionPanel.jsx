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

export default function ActionPanel() {
  const cycle = useFarmStore((s) => s.cycle);
  const actions = useFarmStore((s) => s.actions);
  const busy = useFarmStore((s) => s.busy);
  const performAction = useFarmStore((s) => s.performAction);

  const [active, setActive] = useState(null); // stage awaiting input
  const [values, setValues] = useState({});

  if (!cycle) return null;

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
    setActive(null);
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 rounded-xl shadow-lg p-4 w-[480px] max-w-[92vw]">
      {active ? (
        <>
          <h2 className="font-semibold text-gray-800 mb-3">{stageName(active)}</h2>
          <div className="space-y-3 mb-4">
            {fields.map((f) => (
              <label key={f.key} className="block text-sm text-gray-700">
                {f.label}
                <input
                  type={f.type}
                  value={values[f.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={handleSubmit}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
            >
              Confirm
            </button>
            <button
              onClick={() => setActive(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-semibold text-gray-800 mb-3">Next steps</h2>
          {actions.length === 0 ? (
            <p className="text-sm text-gray-500">No actions left. Cycle complete.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={stageId(a)}
                  disabled={busy || !stageEnabled(a)}
                  onClick={() => handleStageClick(a)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {stageName(a)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}