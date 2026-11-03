import { Route, Routes } from "react-router-dom";
import { Customer } from "./pages/Customer";

export function App() {
  return (
    <Routes>
      <Route path="/agent" element={<div>Agent console</div>} />
      <Route path="/s/:code" element={<Customer />} />
    </Routes>
  );
}
