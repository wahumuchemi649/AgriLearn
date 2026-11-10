import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./index.css";
import CreateCycle from "./components/CreateCycle";
import FarmScreen from "./components/FarmScreen";
import DebriefScreen from "./components/DebriefScreen";
import AuthScreen from "./components/AuthScreen";
import RequireAuth from "./components/Requireauth";
import TutorPage from "./components/TutorPage";

function CreateCycleRoute() {
  const navigate = useNavigate();
  return (
    <CreateCycle
      onCreated={(id) => navigate(`/farm/${id}`)}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
         <Route path="/" element={<RequireAuth><CreateCycleRoute /></RequireAuth>} />
         <Route path="/farm/:cycleId" element={<RequireAuth><FarmScreen /></RequireAuth>} />
         <Route path="/farm/:cycleId/debrief" element={<RequireAuth><DebriefScreen /></RequireAuth>} />
         <Route path="/tutor" element={<RequireAuth><TutorPage /></RequireAuth>} />
         <Route path="/login" element={<AuthScreen />} />
         <Route path="/signup" element={<AuthScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App />);