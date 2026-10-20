import { BrowserRouter, Routes, Route } from "react-router-dom";
import FarmScene from "./components/FarmScreen";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        <Route path="/farm" element={<FarmScene />} />
      </Routes>
    </BrowserRouter>
  );
}