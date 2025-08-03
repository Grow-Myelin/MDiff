import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import DiffViewer from './components/DiffViewer';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-cream">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/diff/:sessionId" element={<DiffViewer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;