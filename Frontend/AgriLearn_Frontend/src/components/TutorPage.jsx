import TutorPanel from "./TutorPanel";

export default function TutorPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] bg-green-50">
      <main className="mx-auto h-full max-w-2xl border-x border-green-100">
        <TutorPanel />
      </main>
    </div>
  );
}