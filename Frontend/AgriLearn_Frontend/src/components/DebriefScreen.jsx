import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDebrief } from "../api/farm";

const cacheKey = (id) => `agrilearn:debrief:${id}`;

// key_moments may be strings or objects; show whatever text is there
function asText(item) {
  if (typeof item === "string") return item;
  return (
    item?.text ?? item?.description ?? item?.title ?? item?.message ?? JSON.stringify(item)
  );
}

const TONES = {
  good: "border-green-200 bg-green-50 text-green-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  moment: "border-purple-200 bg-purple-50 text-purple-900",
};

function Section({ title, tone, items, collapseAfter = 5 }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  const shown = open ? items : items.slice(0, collapseAfter);

  return (
    <section className={`rounded-2xl border p-5 ${TONES[tone]}`}>
      <h2 className="font-semibold mb-3">{title}</h2>
      <ul className="space-y-2 text-sm">
        {shown.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{asText(item)}</span>
          </li>
        ))}
      </ul>
      {items.length > collapseAfter && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 text-sm font-medium underline underline-offset-2"
        >
          {open ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function HealthCard({ health }) {
  if (!health) return null;
  const score = Math.max(0, Math.min(100, Number(health.score) || 0));
  const bar = score >= 66 ? "bg-green-500" : score >= 33 ? "bg-amber-400" : "bg-red-500";
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-gray-800">Final crop health</h2>
        <span className="text-sm text-gray-500">{health.state}</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-1 text-right text-sm font-semibold text-gray-700">{score} / 100</div>
    </section>
  );
}

export default function DebriefScreen() {
  const { cycleId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    // A finished AI debrief does not change, so reopening it should be instant
    try {
      const cached = sessionStorage.getItem(cacheKey(cycleId));
      if (cached) {
        setData(JSON.parse(cached));
        return;
      }
    } catch {
      /* storage unavailable, ignore */
    }

    getDebrief(cycleId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // The template is the fallback, so never cache it: next time the AI may work
        const source = d?.debrief?.source ?? d?.source;
        if (source !== "template") {
          try {
            sessionStorage.setItem(cacheKey(cycleId), JSON.stringify(d));
          } catch {
            /* ignore */
          }
        }
      })
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [cycleId, attempt]);

  const debrief = data?.debrief;
  const source = debrief?.source ?? data?.source;

  return (
    <div className="min-h-screen bg-green-50 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Your season debrief</h1>
          <p className="text-sm text-gray-500">What happened on your farm, and what to try next.</p>
        </header>

        {!data && !error && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
            <p className="text-sm text-gray-600">Your coach is reviewing your season...</p>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-semibold">Could not load the debrief</p>
            <p className="mt-1 break-words">{error}</p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {data && (
          <>
            {debrief?.summary && (
              <section className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-gray-800">{debrief.summary}</p>
                <span className="mt-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                  {source === "template" ? "Standard summary" : "Written by your AI coach"}
                </span>
              </section>
            )}

            <HealthCard health={data.final_health} />
            <Section title="What went well" tone="good" items={debrief?.went_well} />
            <Section title="Key moments" tone="moment" items={debrief?.key_moments} />
            <Section title="What to improve" tone="warn" items={debrief?.improve} />
            <Section title="Next time" tone="info" items={debrief?.next_time} />

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/"
                className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                Start a new cycle
              </Link>
              <Link
                to={`/farm/${cycleId}`}
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Back to the farm
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}