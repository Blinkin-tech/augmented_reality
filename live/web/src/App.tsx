import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/agent" element={<div>Agent console</div>} />
      <Route path="/s/:code" element={<div>Customer</div>} />
    </Routes>
  );
}
