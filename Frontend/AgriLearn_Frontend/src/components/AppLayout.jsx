import { NavLink, Outlet } from "react-router-dom";
import { getActor, logout } from "../api/auth";

export const LAST_CYCLE_KEY = "agrilearn:lastCycle";

const link = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-green-100 text-green-800" : "text-gray-600 hover:bg-gray-100"
  }`;

export default function AppLayout() {
  const actor = getActor();
  const isTeacher = actor?.role === "teacher"; // teachers can't use the tutor
  const name = actor?.username || actor?.name || "";

  const onLogout = () => {
    try { localStorage.removeItem(LAST_CYCLE_KEY); } catch { /* ignore */ }
    logout(); // RequireAuth sees the logout event and sends you to /login
  };

  return (
    <div className="min-h-screen bg-green-50">
      <header className="flex h-14 items-center justify-between border-b border-green-200 bg-white px-4">
        <div className="flex items-center gap-1">
          <span className="mr-3 font-semibold text-green-800">🌽 AgriLearn</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/home" className={link}>Home</NavLink>
            {!isTeacher && <NavLink to="/tutor" className={link}>Tutor</NavLink>}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {name && <span className="hidden text-gray-600 sm:inline">{name}</span>}
          <button onClick={onLogout} className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}