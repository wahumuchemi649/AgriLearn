import { Link } from "react-router-dom";
import TutorPanel from "./TutorPanel";

export default function TutorPage() {
  return (
    <div className="flex h-screen flex-col bg-green-50">
      <header className="flex items-center justify-between border-b border-green-200 bg-white px-4 py-3">
        <h1 className="font-semibold text-green-800">Farm Tutor</h1>
        <Link to="/" className="text-sm text-green-700 hover:underline">
          ← Back to farm
        </Link>
      </header>
      <main className="mx-auto min-h-0 w-full max-w-2xl flex-1 border-x border-green-100">
        <TutorPanel />
      </main>
    </div>
  );
}