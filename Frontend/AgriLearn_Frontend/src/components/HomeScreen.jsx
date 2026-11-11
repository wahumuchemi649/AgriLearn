import { Link } from "react-router-dom";
import { getActor } from "../api/auth";
import { LAST_CYCLE_KEY } from "./AppLayout";

function Card({ to, emoji, title, text, primary }) {
  return (
    <Link
      to={to}
      className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
        primary ? "border-green-600 bg-green-600 text-white" : "border-green-200 bg-white text-gray-800"
      }`}
    >
      <div className="text-3xl">{emoji}</div>
      <div className="mt-2 text-lg font-semibold">{title}</div>
      <div className={`text-sm ${primary ? "text-green-50" : "text-gray-500"}`}>{text}</div>
    </Link>
  );
}

export default function HomeScreen() {
  const actor = getActor();
  const isTeacher = actor?.role === "teacher";
  let last = null;
  try { last = localStorage.getItem(LAST_CYCLE_KEY); } catch { /* ignore */ }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-green-900">
        Karibu{actor?.username ? `, ${actor.username}` : ""}
      </h1>
      <p className="mb-6 text-sm text-gray-600">What would you like to do?</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {last && (
          <Card primary to={`/farm/${last}`} emoji="🚜" title="Continue your farm"
                text="Pick up where you left off." />
        )}
        <Card to="/new" emoji="🌱" title="Start a new farm" text="Choose a mode and season length." />
        {!isTeacher && (
          <Card to="/tutor" emoji="💬" title="Ask the tutor"
                text="Revise or ask anything about farming, in English or Kiswahili." />
        )}
      </div>
    </main>
  );
}