import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";
import History from "./pages/History";
import Summary from "./pages/Summary";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:roomId" element={<Home />} />
            <Route path="/room/:roomId" element={<Room />} />
            <Route path="/history" element={<History />} />
            <Route path="/summary" element={<Summary />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;