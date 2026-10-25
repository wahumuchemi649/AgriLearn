import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./index.css";
import CreateCycle from "./components/CreateCycle";
import FarmScreen from "./components/FarmScreen";
import DebriefScreen from "./components/DebriefScreen";

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
        <Route path="/" element={<CreateCycleRoute />} />
        <Route path="/farm/:cycleId" element={<FarmScreen />} />
        <Route path="/farm/:cycleId/debrief" element={<DebriefScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App />);