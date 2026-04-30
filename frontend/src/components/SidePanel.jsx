import React, { useState, useRef, useEffect } from 'react';
import { Hand, MicOff, UserMinus } from 'lucide-react';
import Chat from './Chat';

const SidePanel = ({
  activeTab,
  setActiveTab,
  messages,
  sendMessage,
  speakingStats,
  participants = [],
  isHost,
  onMuteParticipant,
  onRemoveParticipant,
}) => {


  const renderAnalytics = () => {
    // Deduplicate and merge speaking stats by userName.
    // If the same userName appears under multiple socketIds, sum their
    // totalSpeakingTime and keep isSpeaking true if ANY entry is speaking.
    const merged = {};
    Object.values(speakingStats).forEach((stat) => {
      const name = stat.userName;
      if (merged[name]) {
        merged[name].totalSpeakingTime += stat.totalSpeakingTime;
        merged[name].isSpeaking = merged[name].isSpeaking || stat.isSpeaking;
      } else {
        merged[name] = { ...stat };
      }
    });

    const statsArray = Object.values(merged).sort((a, b) => b.totalSpeakingTime - a.totalSpeakingTime);
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

  const renderParticipants = () => {
    return (
      <div className="panel-content analytics-panel">
        <h3 className="analytics-title">Participants ({participants.length})</h3>
        <p className="analytics-subtitle">People in this meeting</p>
        <div className="stats-list">
          {participants.map((p, idx) => {
            const isSpeaking = speakingStats[p.socketId]?.isSpeaking;
            return (
              <div key={idx} className="stat-item">
                <div className="stat-header" style={{ padding: '8px 0', borderBottom: '1px solid var(--glass-border)' }}>
                  <span className="stat-name">
                    {p.userName} {p.isHost && <span className="host-badge">Host</span>}
                  </span>
                  <span className="stat-time" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {p.raisedHand && <Hand size={16} style={{ color: '#fbbf24' }} />}
                    {isSpeaking && <span className="live-indicator" style={{ fontSize: '12px' }}>●</span>}
                    {isHost && !p.isHost && (
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                        <button
                          onClick={() => onMuteParticipant(p.socketId)}
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                          title="Mute Participant"
                        >
                          <MicOff size={16} />
                        </button>
                        <button
                          onClick={() => onRemoveParticipant(p.socketId)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                          title="Remove Participant"
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
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
          className={`tab-btn ${activeTab === 'participants' ? 'active' : ''}`}
          onClick={() => setActiveTab('participants')}
        >
          Participants
        </button>
        <button 
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>
      {activeTab === 'chat' && <Chat messages={messages} sendMessage={sendMessage} activeTab={activeTab} />}
      {activeTab === 'analytics' && renderAnalytics()}
      {activeTab === 'participants' && renderParticipants()}
    </div>
  );
};

export default SidePanel;
