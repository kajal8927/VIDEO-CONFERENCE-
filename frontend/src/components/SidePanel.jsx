import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

const SidePanel = ({ activeTab, setActiveTab, messages, sendMessage, speakingStats }) => {
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  const handleSend = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput);
      setChatInput('');
    }
  };

  const renderChat = () => (
    <div className="panel-content chat-panel">
      <div className="messages-list">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-bubble ${msg.isLocal ? 'local' : 'remote'}`}>
            <div className="message-sender">{msg.senderName}</div>
            <div className="message-text">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-area" onSubmit={handleSend}>
        <input 
          type="text" 
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type a message..."
          className="glass-input"
        />
        <button type="submit" className="btn-send">
          <Send size={18} />
        </button>
      </form>
    </div>
  );

  const renderAnalytics = () => {
    const statsArray = Object.values(speakingStats).sort((a, b) => b.totalSpeakingTime - a.totalSpeakingTime);
    const totalMeetingSpeakingTime = statsArray.reduce((acc, curr) => acc + curr.totalSpeakingTime, 0) || 1; // avoid div by 0

    return (
      <div className="panel-content analytics-panel">
        <h3 className="analytics-title">Smart Speaking Time Analyzer</h3>
        <p className="analytics-subtitle">Track participant engagement in real-time</p>
        
        <div className="stats-list">
          {statsArray.map((stat, idx) => {
            const percentage = Math.min(100, Math.round((stat.totalSpeakingTime / totalMeetingSpeakingTime) * 100));
            const timeInSeconds = Math.round(stat.totalSpeakingTime / 1000);
            const formattedTime = timeInSeconds > 60 
              ? `${Math.floor(timeInSeconds / 60)}m ${timeInSeconds % 60}s` 
              : `${timeInSeconds}s`;

            return (
              <div key={idx} className="stat-item">
                <div className="stat-header">
                  <span className="stat-name">
                    {stat.userName} {stat.isSpeaking && <span className="live-indicator">●</span>}
                  </span>
                  <span className="stat-time">{formattedTime} ({percentage}%)</span>
                </div>
                <div className="stat-bar-bg">
                  <div 
                    className={`stat-bar-fill ${stat.isSpeaking ? 'active' : ''}`} 
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
          {statsArray.length === 0 && (
            <div className="no-stats">No speaking data yet.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="side-panel glass-panel">
      <div className="panel-tabs">
        <button 
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button 
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>
      {activeTab === 'chat' ? renderChat() : renderAnalytics()}
    </div>
  );
};

export default SidePanel;
