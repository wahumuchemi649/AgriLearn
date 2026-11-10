import { useState } from "react";
import TutorPanel from "./TutorPanel";

export default function TutorDrawer({ cycleId }) {
  const [open, setOpen] = useState(false);

  const close = () => {
    window.speechSynthesis?.cancel(); // stop reading when the drawer closes
    setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-green-700"
        >
          🌱 Ask Tutor
        </button>
      )}

      {/* Always mounted, so history, scroll and voice state survive open/close */}
      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-green-200 bg-white shadow-2xl transition-all duration-300 sm:w-[400px] ${
          open ? "translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-green-100 px-4 py-2">
          <span className="font-semibold text-green-800">Farm Tutor</span>
          <button
            onClick={close}
            aria-label="Close tutor"
            className="rounded px-2 py-1 text-xl text-gray-500 hover:bg-gray-100"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <TutorPanel cycleId={cycleId} />
        </div>
      </aside>
    </>
  );
}