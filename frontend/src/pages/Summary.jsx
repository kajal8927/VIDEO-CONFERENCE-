import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, ListChecks, ArrowLeft, Loader2, PlaySquare } from "lucide-react";

const Summary = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  // Data from Room.jsx
  const { messages = [], speakingStats = {}, participants = [], meetingDuration = 0, roomId } = location.state || {};

  const generateSummary = async () => {
    setIsGenerating(true);
    
    try {
      const SERVER_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
      const response = await fetch(`${SERVER_URL}/api/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId,
          messages,
          speakingStats
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const data = await response.json();
      setSummaryData({
        paragraph: data.summary || "Summary generated successfully.",
        keyPoints: data.keyPoints || [],
        actionItems: data.actionItems || [],
        participantInsights: data.participantInsights || []
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("Failed to generate summary. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!location.state) {
    return (
      <div className="summary-container center-all">
        <h2>No meeting data found.</h2>
        <button className="btn-secondary" style={{ marginTop: "16px" }} onClick={() => navigate("/")}>
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="summary-page">
      <div className="summary-header-wrapper">
        <button className="back-btn" onClick={() => navigate("/")}>
          <ArrowLeft size={18} /> Back to Home
        </button>
        <div className="summary-titles">
          <h1>Meeting Summary</h1>
          <p>
            Room: {roomId} | Duration: {Math.floor(meetingDuration / 60)}m {meetingDuration % 60}s
          </p>
        </div>
      </div>

      {!summaryData && !isGenerating && (
        <div className="generate-card glass-panel">
          <FileText size={48} className="generate-icon mb-4" />
          <h2>AI Meeting Summary</h2>
          <p className="subtitle">
            Generate a smart summary based on chat history and speaking patterns.
          </p>
          <button className="btn-primary mt-4 generate-btn" onClick={generateSummary}>
            Generate Summary
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="generating-state glass-panel">
          <Loader2 size={48} className="spin generate-icon mb-4" />
          <h2>Analyzing Meeting Data...</h2>
          <p className="subtitle">Processing {messages.length} messages and audio stats.</p>
        </div>
      )}

      {summaryData && (
        <div className="summary-results">
          <div className="summary-card glass-panel main-summary">
            <h3>
              <FileText size={20} /> Overview
            </h3>
            <p className="summary-text">{summaryData.paragraph}</p>
          </div>

          <div className="summary-grid">
            <div className="summary-card glass-panel">
              <h3>
                <ListChecks size={20} /> Key Points
              </h3>
              <ul className="styled-list">
                {summaryData.keyPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
            <div className="summary-card glass-panel">
              <h3>
                <PlaySquare size={20} /> Action Items
              </h3>
              <ul className="action-list styled-list">
                {summaryData.actionItems.map((pt, i) => (
                  <li key={i} className="task-item">
                    <input type="checkbox" id={`task-${i}`} className="task-checkbox" />
                    <label htmlFor={`task-${i}`}>{pt}</label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Summary;
