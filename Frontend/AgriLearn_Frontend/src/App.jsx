import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./index.css";
import CreateCycle from "./components/CreateCycle";
import FarmScreen from "./components/FarmScreen";
import DebriefScreen from "./components/DebriefScreen";
import AuthScreen from "./components/AuthScreen";
import RequireAuth from "./components/Requireauth";
import TutorPage from "./components/TutorPage";
import AppLayout from "./components/AppLayout";
import HomeScreen from "./components/HomeScreen";

function CreateCycleRoute() {
  const navigate = useNavigate();
  return <CreateCycle onCreated={(id) => navigate(`/farm/${id}`)} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* Pages with the navbar */}
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/new" element={<CreateCycleRoute />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/farm/:cycleId/debrief" element={<DebriefScreen />} />
        </Route>

        {/* The farm is full-screen, so no navbar */}
        <Route path="/farm/:cycleId" element={<RequireAuth><FarmScreen /></RequireAuth>} />

        <Route path="/login" element={<AuthScreen />} />
        <Route path="/signup" element={<AuthScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App />);