import { useState } from "react";
import { createCycle } from "../api/farm";

const MAIZE_ID = 1; // hardcoded test crop, replace with a crop picker later

const MODES = [
  {
    value: "Guided",
    emoji: "🧭",
    title: "Guided",
    description: "Step-by-step help. The next stage is shown as you go.",
  },
  {
    value: "Free",
    emoji: "🧑‍🌾",
    title: "Free",
    description: "You decide the order of work, with no hand-holding.",
  },
];

const DURATION_PRESETS = [1, 2, 4, 8];

function OptionCard({ selected, onClick, children, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
        selected
          ? "border-green-600 bg-green-50 text-green-900"
          : "border-gray-200 bg-white text-gray-700 hover:border-green-300"
      } ${className}`}
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
  const modeInfo = MODES.find((m) => m.value === mode);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The server takes the owner (student or group) from the login token
      const cycle = await createCycle({
        crop: MAIZE_ID,
        mode,
        real_duration_hours: hoursValue,
      });
      onCreated(cycle.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-green-50 px-4 py-6 sm:py-10">
      <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center gap-3">
          <div className="text-4xl" aria-hidden="true">🌽</div>
          <div>
            <h1 className="text-2xl font-bold text-green-900">Start a Maize cycle</h1>
            <p className="text-sm text-gray-600">
              Choose how you want to play and how long your season lasts.
            </p>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          {/* Left: choices */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">1. How do you want to play?</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {MODES.map((m) => (
                  <OptionCard
                    key={m.value}
                    selected={mode === m.value}
                    onClick={() => setMode(m.value)}
                  >
                    <div className="text-2xl">{m.emoji}</div>
                    <div className="mt-1 text-sm font-semibold">{m.title}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{m.description}</div>
                  </OptionCard>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800">2. Season length</h2>
              <p className="mb-3 text-xs text-gray-500">
                How long the whole growing season takes in real time. The simulation compresses it
                so you see every stage within this time.
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
                <label className="ml-1 flex items-center gap-2 text-sm text-gray-600">
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
          </div>

          {/* Right: summary and start */}
          <aside className="h-fit rounded-2xl border border-green-200 bg-white p-5 shadow-sm md:sticky md:top-6">
            <h2 className="text-sm font-semibold text-gray-800">Your farm</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Crop</dt>
                <dd className="font-medium text-gray-900">Maize</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Mode</dt>
                <dd className="font-medium text-gray-900">{modeInfo?.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Season</dt>
                <dd className="font-medium text-gray-900">
                  {valid ? hoursValue : "?"} {hoursValue === 1 ? "hour" : "hours"}
                </dd>
              </div>
            </dl>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                Could not start the cycle: {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!valid || busy}
              className="mt-5 w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {busy ? "Starting your farm..." : "Start cycle"}
            </button>
          </aside>
        </div>
      </form>
    </main>
  );
}