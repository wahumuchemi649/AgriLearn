import { useFarmStore } from "./useFarmStore";
import { actionKey, actionLabel } from "../api/farm";

export default function ActionPanel() {
  const cycle = useFarmStore((s) => s.cycle);
  const actions = useFarmStore((s) => s.actions);
  const busy = useFarmStore((s) => s.busy);
  const performAction = useFarmStore((s) => s.performAction);

  if (!cycle) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 rounded-xl shadow-lg p-4 w-[460px] max-w-[92vw]">
      <h2 className="font-semibold text-gray-800 mb-3">Farm actions</h2>

      {actions.length === 0 ? (
        <p className="text-sm text-gray-500">No actions available right now.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={actionKey(a)}
              disabled={busy}
              onClick={() => performAction(a)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {actionLabel(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}