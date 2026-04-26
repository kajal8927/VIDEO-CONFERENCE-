import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users, ArrowRight } from 'lucide-react';

const Home = () => {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!userName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newRoomId}`, { state: { userName } });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    if (!roomId.trim()) {
      alert("Please enter a Room ID.");
      return;
    }
    navigate(`/room/${roomId}`, { state: { userName } });
  };

  return (
    <div className="home-container">
      <div className="home-card glass-panel">
        <div className="home-header">
          <div className="logo-container">
            <Video size={36} className="logo-icon" />
          </div>
          <h1 className="gradient-text">NovaMeet</h1>
          <p className="subtitle">Premium Real-time Video Collaboration</p>
        </div>

        <div className="home-content">
          <div className="input-group">
            <label>Your Name</label>
            <input 
              type="text" 
              placeholder="e.g. John Doe" 
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="glass-input"
            />
          </div>

          <div className="actions-divider">
            <span>Start a meeting</span>
          </div>

          <button onClick={handleCreateRoom} className="btn-primary full-width">
            <Video size={20} />
            New Meeting
          </button>

          <div className="actions-divider">
            <span>or join existing</span>
          </div>

          <form onSubmit={handleJoinRoom} className="join-form">
            <input 
              type="text" 
              placeholder="Enter Room ID" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="glass-input"
            />
            <button type="submit" className="btn-secondary">
              Join <ArrowRight size={18} />
            </button>
          </form>
        </div>
        
        <div className="home-features">
          <div className="feature">
            <Users size={16} />
            <span>Smart Speaking Analytics</span>
          </div>
          <div className="feature">
            <Video size={16} />
            <span>HD Video</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
