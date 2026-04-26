import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import { AudioAnalyzer } from '../utils/audioAnalyzer';
import VideoGrid from '../components/VideoGrid';
import SidePanel from '../components/SidePanel';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, BarChart2 } from 'lucide-react';

const SERVER_URL = 'http://localhost:3000'; // Update for production

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = location.state?.userName || 'Anonymous';

  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [speakingStats, setSpeakingStats] = useState({});
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'analytics'

  const audioAnalyzerRef = useRef(null);

  useEffect(() => {
    // 1. Get User Media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setLocalStream(stream);
        
        // 2. Connect to Socket
        const newSocket = io(SERVER_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
          newSocket.emit('join-room', roomId, userName);
        });

        // 3. Setup Audio Analyzer for local mic
        const analyzer = new AudioAnalyzer(stream, (isSpeaking) => {
          newSocket.emit('speaking-state-change', roomId, isSpeaking);
        });
        analyzer.start();
        audioAnalyzerRef.current = analyzer;

        // Listen for chats
        newSocket.on('chat-message', (senderId, message) => {
          setMessages(prev => [...prev, { senderId, ...message, isLocal: false }]);
        });

        // Listen for speaking stats
        newSocket.on('speaking-stats', (stats) => {
          setSpeakingStats(stats);
        });
      })
      .catch((err) => {
        console.error("Error accessing media devices.", err);
        alert("Could not access camera or microphone. Please check permissions.");
        navigate('/');
      });

    return () => {
      if (audioAnalyzerRef.current) {
        audioAnalyzerRef.current.stop();
      }
      setLocalStream(prevStream => {
        if (prevStream) {
          prevStream.getTracks().forEach(track => track.stop());
        }
        return null;
      });
      if (socket) {
        socket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userName, navigate]);

  const { streams, disconnectAll } = useWebRTC(socket, roomId, localStream);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
      setIsMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
      setIsVideoOff(!localStream.getVideoTracks()[0].enabled);
    }
  };

  const handleLeaveRoom = () => {
    disconnectAll();
    navigate('/');
  };

  const sendMessage = (text) => {
    if (socket && text.trim()) {
      const message = { text, senderName: userName, time: new Date().toISOString() };
      socket.emit('chat-message', roomId, message);
      setMessages(prev => [...prev, { socketId: socket.id, ...message, isLocal: true }]);
    }
  };

  if (!localStream) {
    return <div className="loading-screen">Joining room...</div>;
  }

  return (
    <div className="room-container">
      <div className="main-content">
        <div className="header-bar">
          <div className="room-info">
            <h2>Room: {roomId}</h2>
          </div>
        </div>

        <VideoGrid 
          localStream={localStream} 
          remoteStreams={streams} 
          userName={userName}
          speakingStats={speakingStats}
          localSocketId={socket?.id}
        />

        <div className="control-bar">
          <button className={`control-btn ${isMuted ? 'danger' : ''}`} onClick={toggleMute}>
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button className={`control-btn ${isVideoOff ? 'danger' : ''}`} onClick={toggleVideo}>
            {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
          </button>
          <button className="control-btn leave-btn" onClick={handleLeaveRoom}>
            <PhoneOff size={24} />
          </button>
          
          <div className="mobile-tabs">
             <button className="control-btn" onClick={() => setActiveTab('chat')}>
               <MessageSquare size={24} />
             </button>
             <button className="control-btn" onClick={() => setActiveTab('analytics')}>
               <BarChart2 size={24} />
             </button>
          </div>
        </div>
      </div>

      <SidePanel 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        messages={messages} 
        sendMessage={sendMessage}
        speakingStats={speakingStats}
      />
    </div>
  );
};

export default Room;
