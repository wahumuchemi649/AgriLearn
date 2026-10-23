import { useState } from "react";
import { createCycle } from "../api/farm";

const MAIZE_ID = 1; // hardcoded test crop, replace with a crop picker later
const TEST_STUDENT_ID = 1; // hardcoded test student for now

const MODES = [
  {
    value: "Guided",
    title: "Guided",
    description: "Step-by-step help, with the next stage shown as you go.",
  },
  {
    value: "Free",
    title: "Free",
    description: "You decide the order of work, with no hand-holding.",
  },
];

const DURATION_PRESETS = [1, 2, 4, 8];

function OptionCard({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
        selected
          ? "border-green-600 bg-green-50 text-green-900"
          : "border-gray-200 bg-white text-gray-700 hover:border-green-300"
      }`}
    >
      {children}
    </button>
  );
}

export default function CreateCycle({ onCreated }) {
  const [mode, setMode] = useState("Guided");
  const [hours, setHours] = useState(2);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hoursValue = custom !== "" ? Number(custom) : hours;
  const valid = Number.isFinite(hoursValue) && hoursValue > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cycle = await createCycle({
        crop: MAIZE_ID,
        mode,
        real_duration_hours: hoursValue,
        owner_type: "student",
        student: TEST_STUDENT_ID,
      });
      console.log("created cycle:", cycle);
      onCreated(cycle.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-6 sm:p-8 space-y-7"
      >
        <header className="flex items-center gap-3">
          <div className="text-4xl" aria-hidden="true">🌽</div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Start a Maize cycle
            </h1>
            <p className="text-sm text-gray-500">
              Choose how you want to play and how long your season lasts.
            </p>
          </div>
        </header>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">1. Mode</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODES.map((m) => (
              <OptionCard
                key={m.value}
                selected={mode === m.value}
                onClick={() => setMode(m.value)}
              >
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {m.description}
                </div>
              </OptionCard>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800">
            2. Season length
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            How long the whole growing season takes in real time. The simulation
            compresses it so you see every stage within this time.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((h) => (
              <OptionCard
                key={h}
                selected={custom === "" && hours === h}
                onClick={() => {
                  setHours(h);
                  setCustom("");
                }}
              >
                <span className="text-sm font-medium">
                  {h} {h === 1 ? "hour" : "hours"}
                </span>
              </OptionCard>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-600 ml-1">
              Custom
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="hours"
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </label>
          </div>
        </section>

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          You'll grow <b>Maize</b> in <b>{mode}</b> mode over{" "}
          <b>{valid ? hoursValue : "?"}</b>{" "}
          {hoursValue === 1 ? "hour" : "hours"}.
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            Could not start the cycle: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? "Starting your farm..." : "Start cycle"}
        </button>
      </form>
    </div>
  );
}