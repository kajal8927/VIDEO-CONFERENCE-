import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { useWebRTC } from "../hooks/useWebRTC";
import { AudioAnalyzer } from "../utils/audioAnalyzer";
import VideoGrid from "../components/VideoGrid";
import SidePanel from "../components/SidePanel";
import { supabase } from "../lib/supabase";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  BarChart2,
  Hand,
  MonitorUp,
  Users,
  Clock,
  Smile,
  Lock,
  Unlock,
} from "lucide-react";

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = location.state?.userName || "Anonymous";

  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [messages, setMessages] = useState([]);
  const messageIdsRef = useRef(new Set());

  const [speakingStats, setSpeakingStats] = useState({});
  const [activeTab, setActiveTab] = useState("chat");
  const [participants, setParticipants] = useState([]);

  // Deduplicate participants by userName for display only.
  // Keeps the first socket entry per name so host controls still target a valid socketId.
  // Actual socket connections remain untouched — WebRTC is unaffected.
  const uniqueParticipants = useMemo(() => {
    const seen = new Set();
    return participants.filter((p) => {
      if (seen.has(p.userName)) return false;
      seen.add(p.userName);
      return true;
    });
  }, [participants]);

  const [isHost, setIsHost] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);

  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState({});

  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const [mediaError, setMediaError] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const [meetingDuration, setMeetingDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMeetingDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const latestDataRef = useRef({ messages: [], speakingStats: {}, participants: [], meetingDuration: 0 });

  useEffect(() => {
    latestDataRef.current = { messages, speakingStats, participants, meetingDuration };
  }, [messages, speakingStats, participants, meetingDuration]);

  const navigateToSummary = () => {
    const data = latestDataRef.current;
    navigate("/summary", { 
      state: { 
        roomId, 
        messages: data.messages, 
        speakingStats: data.speakingStats, 
        participants: data.participants, 
        meetingDuration: data.meetingDuration 
      } 
    });
  };

  const formatTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const audioAnalyzerRef = useRef(null);
  const meetingIdRef = useRef(null);
  const socketIdRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const originalStreamRef = useRef(null);

  const { streams, disconnectAll, replaceVideoTrack } = useWebRTC(
    socket,
    roomId,
    localStream
  );

  const getMeeting = async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("room_code", roomId)
      .maybeSingle();

    if (error) {
      console.error("Meeting fetch error:", error);
      return null;
    }

    return data;
  };

  const saveParticipant = async (meetingId, socketId) => {
    if (!meetingId || !socketId) return;

    const { error } = await supabase.from("meeting_participants").insert({
      meeting_id: meetingId,
      guest_name: userName,
      socket_id: socketId,
    });

    if (error) console.error("Participant save error:", error);
  };

  const updateParticipantLeave = async () => {
    const meetingId = meetingIdRef.current;
    const socketId = socketIdRef.current;

    if (!meetingId || !socketId) return;

    const { error } = await supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", meetingId)
      .eq("socket_id", socketId);

    if (error) console.error("Participant leave update error:", error);
  };

  const saveSpeakingStats = async () => {
    const meetingId = meetingIdRef.current;
    const socketId = socketIdRef.current;

    if (!meetingId || !socketId) return;

    const myStats = speakingStats[socketId];
    if (!myStats) return;

    const totalRoomTime = Object.values(speakingStats).reduce(
      (sum, user) => sum + (user.totalSpeakingTime || 0),
      0
    );

    const percentage =
      totalRoomTime > 0
        ? ((myStats.totalSpeakingTime / totalRoomTime) * 100).toFixed(2)
        : 0;

    const { error } = await supabase.from("speaking_stats").insert({
      meeting_id: meetingId,
      participant_name: userName,
      total_seconds: Math.round((myStats.totalSpeakingTime || 0) / 1000),
      percentage,
    });

    if (error) console.error("Speaking stats save error:", error);
  };

  useEffect(() => {
    let currentSocket = null;
    let connectionTimer = null;

    const setupRoom = async () => {
      try {
        setMediaError(null);
        setConnectionError(null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        originalStreamRef.current = stream;
cameraTrackRef.current = stream.getVideoTracks()[0];

setLocalStream(stream);

        cameraTrackRef.current = stream.getVideoTracks()[0];
        setLocalStream(stream);

        const meeting = await getMeeting();

        if (!meeting) {
          alert("Meeting not found.");
          navigate("/");
          return;
        }

        meetingIdRef.current = meeting.id;

        currentSocket = io(SERVER_URL, {
          reconnectionAttempts: 5,
          timeout: 10000,
        });

        socketRef.current = currentSocket;
        setSocket(currentSocket);

        connectionTimer = setTimeout(() => {
          if (!currentSocket.connected) {
            setConnectionError("Could not connect to signaling server.");
          }
        }, 15000);

        currentSocket.on("connect", async () => {
          clearTimeout(connectionTimer);
          socketIdRef.current = currentSocket.id;

          await saveParticipant(meeting.id, currentSocket.id);
          currentSocket.emit("join-room", roomId, userName);
        });

        currentSocket.on("connect_error", (err) => {
          console.error("Socket connection error:", err);
          setConnectionError(err.message || "Socket connection failed.");
        });

        currentSocket.on("chat-message", (senderId, message) => {
          if (senderId === currentSocket.id) return;

          const messageId =
            message?.id ||
            `${senderId}-${message?.time || ""}-${message?.text || message}`;

          if (messageIdsRef.current.has(messageId)) return;

          messageIdsRef.current.add(messageId);

          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              senderId,
              senderName: message?.senderName || "Participant",
              text: message?.text || String(message),
              time: message?.time || new Date().toISOString(),
              isLocal: false,
            },
          ]);
        });

        currentSocket.on("host-status", (status) => setIsHost(status));
        currentSocket.on("room-lock-status", (status) => setIsRoomLocked(status));

        currentSocket.on("speaking-stats", (stats) => {
          setSpeakingStats(stats);
        });

        // Backend sends full participant list via 'participants-update' (single source of truth)
        currentSocket.on("participants-update", (list) => {
          setParticipants(list);
        });

        currentSocket.on("room-users", (users) => {
          console.log("Initial room users (IDs):", users);
          // We rely on participants-update for the full objects list.
        });

        currentSocket.on("user-joined", (socketId, name) => {
          console.log(`User joined: ${name} (${socketId})`);
          // State is handled by participants-update broadcast from backend.
        });

        currentSocket.on("user-left", (socketId) => {
          setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
          console.log(`User left: ${socketId}`);
        });

        currentSocket.on("raise-hand-update", ({ socketId, raisedHand }) => {
          setRaisedHands((prev) => ({
            ...prev,
            [socketId]: raisedHand,
          }));
        });

        currentSocket.on("room-locked", () => {
          alert("This room is locked by the host.");
          navigate("/");
        });

        currentSocket.on("duplicate-session-closed", () => {
          alert("Your previous session was closed");
          currentSocket.disconnect();
          navigate("/", { replace: true });
        });

        currentSocket.on("receive-reaction", (data) => {
          setFloatingReactions((prev) => [...prev, data]);
          setTimeout(() => {
            setFloatingReactions((prev) =>
              prev.filter((r) => r.id !== data.id)
            );
          }, 4000);
        });

        currentSocket.on("you-were-removed", () => {
          alert("You were removed by the host.");
          navigateToSummary();
        });

        currentSocket.on("meeting-ended-by-host", () => {
          alert("Meeting ended by host.");
          navigateToSummary();
        });

        currentSocket.on("mute-requested", () => {
          alert("Host requested you to mute your microphone.");
        });

        const analyzer = new AudioAnalyzer(stream, (isSpeaking) => {
          socketRef.current?.emit("speaking-state-change", roomId, isSpeaking);
        });

        analyzer.start();
        audioAnalyzerRef.current = analyzer;
      } catch (err) {
        console.error("Media setup error:", err);
        setMediaError(err);
      }
    };

    setupRoom();

    return () => {
      clearTimeout(connectionTimer);

      audioAnalyzerRef.current?.stop();
      audioAnalyzerRef.current = null;

      screenTrackRef.current?.stop();
      screenTrackRef.current = null;

      setLocalStream((prev) => {
        if (prev) {
          prev.getTracks().forEach((track) => track.stop());
        }
        return null;
      });

      if (currentSocket) {
        currentSocket.off("connect");
        currentSocket.off("connect_error");
        currentSocket.off("chat-message");
        currentSocket.off("host-status");
        currentSocket.off("room-lock-status");
        currentSocket.off("speaking-stats");
        currentSocket.off("participants-update");
        currentSocket.off("room-users");
        currentSocket.off("user-joined");
        currentSocket.off("user-left");
        currentSocket.off("receive-reaction");
        currentSocket.off("raise-hand-update");
        currentSocket.off("room-locked");
        currentSocket.off("duplicate-session-closed");
        currentSocket.off("you-were-removed");
        currentSocket.off("meeting-ended-by-host");
        currentSocket.off("mute-requested");
        currentSocket.disconnect();
      }

      socketRef.current = null;
      setSocket(null);
    };
  }, [roomId, userName, navigate, retryCount]);

  const toggleMute = () => {
    const audioTrack = localStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  };

  const toggleVideo = () => {
    const videoTrack = localStream?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoOff(!videoTrack.enabled);
  };

  const stopScreenShare = async () => {
    if (!cameraTrackRef.current || !localStream) return;

    await replaceVideoTrack(cameraTrackRef.current);

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    const restoredStream = new MediaStream([
      cameraTrackRef.current,
      ...localStream.getAudioTracks(),
    ]);

    setLocalStream(restoredStream);
    setIsScreenSharing(false);
    
    if (socketRef.current) {
      socketRef.current.emit("screen-share-stopped", roomId);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!localStream) return;

      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        await replaceVideoTrack(screenTrack);

        const newStream = new MediaStream([
          screenTrack,
          ...localStream.getAudioTracks(),
        ]);

        setLocalStream(newStream);
        setIsScreenSharing(true);
        
        if (socketRef.current) {
          socketRef.current.emit("screen-share-started", roomId);
        }

        screenTrack.onended = async () => {
          await stopScreenShare();
        };
      } else {
        await stopScreenShare();
      }
    } catch (error) {
      console.error("Screen share error:", error);
      alert("Screen sharing was cancelled or failed.");
    }
  };

  const toggleRaiseHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);

    if (socketRef.current) {
      setRaisedHands((prev) => ({
        ...prev,
        [socketRef.current.id]: nextState,
      }));

      socketRef.current.emit("raise-hand", roomId, nextState);
    }
  };

  const handleLeaveRoom = async () => {
    await saveSpeakingStats();
    await updateParticipantLeave();

    if (socketRef.current) {
      socketRef.current.emit("raise-hand", roomId, false);
    }

    await stopScreenShare();
    disconnectAll();

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    navigateToSummary();
  };

  const sendMessage = async (text) => {
    const cleanText = text.trim();
    if (!socketRef.current || !cleanText) return;

    const message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      text: cleanText,
      senderName: userName,
      time: new Date().toISOString(),
    };

    messageIdsRef.current.add(message.id);
    socketRef.current.emit("chat-message", roomId, message);

    setMessages((prev) => [
      ...prev,
      {
        id: message.id,
        socketId: socketRef.current.id,
        senderId: socketRef.current.id,
        ...message,
        isLocal: true,
      },
    ]);

    if (meetingIdRef.current) {
      const { error } = await supabase.from("chat_messages").insert({
        meeting_id: meetingIdRef.current,
        sender_name: userName,
        message: cleanText,
      });

      if (error) console.error("Chat save error:", error);
    }
  };

  const sendReaction = (emoji) => {
    socketRef.current?.emit("send-reaction", roomId, emoji, userName);
    setShowReactionPicker(false);
  };

  if (mediaError) {
    return (
      <div className="error-screen">
        <h2>Camera/Microphone Permission Required</h2>
        <p>{mediaError.message}</p>

        <button
          className="btn-primary"
          onClick={() => {
            setMediaError(null);
            setRetryCount((prev) => prev + 1);
          }}
        >
          Retry
        </button>

        <button className="btn-secondary" onClick={() => navigate("/")}>
          Go Back
        </button>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="error-screen">
        <h2>Connection Error</h2>
        <p>{connectionError}</p>

        <button
          className="btn-primary"
          onClick={() => {
            setConnectionError(null);
            setRetryCount((prev) => prev + 1);
          }}
        >
          Retry
        </button>

        <button className="btn-secondary" onClick={() => navigate("/")}>
          Go Back
        </button>
      </div>
    );
  }

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

          <div className="header-stats">
            <div className="stat-badge timer-badge">
              <Clock size={16} />
              <span>{formatTime(meetingDuration)}</span>
            </div>
            <div className="stat-badge count-badge">
              <Users size={16} />
              <span>Participants: {uniqueParticipants.length || 1}</span>
            </div>
          </div>

          {isScreenSharing && (
            <span className="screen-share-indicator">
              You are sharing screen
            </span>
          )}
        </div>

        {/* Floating Reactions */}
        <div className="floating-reactions-container">
          {floatingReactions.map((r) => (
            <div key={r.id} className="floating-reaction">
              <span className="reaction-emoji">{r.reaction}</span>
              <span className="reaction-sender">{r.senderName}</span>
            </div>
          ))}
        </div>

        <VideoGrid
          localStream={localStream}
          remoteStreams={streams}
          userName={userName}
          speakingStats={speakingStats}
          localSocketId={socket?.id}
          raisedHands={raisedHands}
        />

        <div className="control-bar">
          <button
            className={`control-btn ${isMuted ? "danger" : ""}`}
            onClick={toggleMute}
            title="Mute / Unmute"
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <button
            className={`control-btn ${isVideoOff ? "danger" : ""}`}
            onClick={toggleVideo}
            title="Camera On / Off"
          >
            {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
          </button>

          <button
            className={`control-btn ${isHandRaised ? "active" : ""}`}
            onClick={toggleRaiseHand}
            title={isHandRaised ? "Lower Hand" : "Raise Hand"}
          >
            <Hand size={24} />
          </button>

          <div className="reaction-container" style={{ position: "relative" }}>
            <button
              className={`control-btn ${showReactionPicker ? "active" : ""}`}
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              title="Send Reaction"
            >
              <Smile size={24} />
            </button>
            {showReactionPicker && (
              <div className="reaction-picker">
                {["👍", "👏", "❤️", "😂", "🎉"].map((emoji) => (
                  <button
                    key={emoji}
                    className="reaction-emoji-btn"
                    onClick={() => sendReaction(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isHost && (
            <button
              className={`control-btn ${isRoomLocked ? "danger" : ""}`}
              onClick={() => {
                socketRef.current?.emit(
                  isRoomLocked ? "host-unlock-room" : "host-lock-room",
                  roomId
                );
              }}
              title={isRoomLocked ? "Unlock Room" : "Lock Room"}
            >
              {isRoomLocked ? <Lock size={24} /> : <Unlock size={24} />}
            </button>
          )}

          <button
            className={`control-btn ${isScreenSharing ? "active" : ""}`}
            onClick={toggleScreenShare}
            title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
          >
            <MonitorUp size={24} />
          </button>

          <button
            className="control-btn leave-btn"
            onClick={handleLeaveRoom}
            title="Leave Meeting"
          >
            <PhoneOff size={24} />
          </button>

          <div className="mobile-tabs">
            <button className={`control-btn ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>
              <MessageSquare size={24} />
            </button>

            <button
              className={`control-btn ${activeTab === "participants" ? "active" : ""}`}
              onClick={() => setActiveTab("participants")}
            >
              <Users size={24} />
            </button>

            <button
              className={`control-btn ${activeTab === "analytics" ? "active" : ""}`}
              onClick={() => setActiveTab("analytics")}
            >
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
        participants={uniqueParticipants}
        isHost={isHost}
        onMuteParticipant={(id) => socketRef.current?.emit("host-mute-participant", roomId, id)}
        onRemoveParticipant={(id) => socketRef.current?.emit("host-remove-participant", roomId, id)}
      />
    </div>
  );
};

export default Room;