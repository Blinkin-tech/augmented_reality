import { Route, Routes } from "react-router-dom";
import { Agent } from "./pages/Agent";
import { Customer } from "./pages/Customer";

export function App() {
  return (
    <Routes>
      <Route path="/agent" element={<Agent />} />
      <Route path="/s/:code" element={<Customer />} />
    </Routes>
  );
}
