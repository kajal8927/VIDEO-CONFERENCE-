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
  Hand,
  MonitorUp,
  Users,
  Clock,
  Smile,
  Lock,
  Unlock,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SERVER_URL = API_URL.replace(/\/api$/, "");

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const userNameRef = useRef("");
  const [nameReady, setNameReady] = useState(false);
  const [tempName, setTempName] = useState(userNameRef.current || "");
  useEffect(() => {
    if (userNameRef.current && !tempName) {
      setTempName(userNameRef.current);
    }
  }, [userNameRef.current]);
  // Resolve the display name using Supabase, localStorage, or manual input
  const resolveUserName = async () => {
    // 1. Manual typed name from Home.jsx or locked in current session (HIGHEST)
    if (location.state?.userName) {
      const manualName = location.state.userName;
      sessionStorage.setItem("lockedUserName", manualName);
      localStorage.setItem("userName", manualName);
      return manualName;
    }

    const lockedName = sessionStorage.getItem("lockedUserName");
    if (lockedName) {
      return lockedName;
    }

    // 2. Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const user = session.user;
      const nameFromSupabase = (user.email ? user.email.split("@")[0] : "") || user.user_metadata?.full_name;
      
      if (nameFromSupabase) {
        // Overwrite any stale localStorage name with the authentic Supabase name
        localStorage.setItem("userName", nameFromSupabase);
        return nameFromSupabase;
      }
      
      // Never fall back to localStorage if there is an active Supabase session
      return "Guest";
    }

    // 3. localStorage fallback ONLY if there is no active session
    const lsKeys = ["userName", "username", "name", "email"];
    for (const key of lsKeys) {
      const val = localStorage.getItem(key);
      if (val) {
        if (key === "email" && val.includes("@")) {
          return val.split("@")[0];
        }
        return val;
      }
    }
    
    // No name found
    return null;
  };

  // Initial name resolution effect
  useEffect(() => {
    const initName = async () => {
      const resolved = await resolveUserName();
      if (resolved) {
        setUserName(resolved);
        userNameRef.current = resolved;
        setNameReady(true);
        // persist in localStorage for future sessions
        localStorage.setItem("userName", resolved);
      } else {
        setNameReady(false);
      }
    };
    initName();
  }, []);

  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUsers, setMutedUsers] = useState({});
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [cameraOffUsers, setCameraOffUsers] = useState({});
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [isWaiting, setIsWaiting] = useState(true);
  const [isDenied, setIsDenied] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showLinkToast, setShowLinkToast] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  const meetingLink = `${window.location.origin}/room/${roomId}`;
  const handleCopyLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "NovaMeet", text: "Join my meeting", url: meetingLink }).catch(()=>navigator.clipboard.writeText(meetingLink));
      } else {
        await navigator.clipboard.writeText(meetingLink);
      }
      setShowLinkToast(true);
      setTimeout(() => setShowLinkToast(false), 3000);
    } catch(e) {}
  };

  const [messages, setMessages] = useState([]);
  const messageIdsRef = useRef(new Set());

  const [speakingStats, setSpeakingStats] = useState({});
  const [activeTab, setActiveTab] = useState("chat");
  const [participants, setParticipants] = useState([]);

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

  const audioAnalyzerRef = useRef(null);
  const meetingIdRef = useRef(null);
  const socketIdRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const originalStreamRef = useRef(null);

  const latestDataRef = useRef({
    messages: [],
    speakingStats: {},
    participants: [],
    meetingDuration: 0,
  });

  const { streams, disconnectAll, replaceVideoTrack } = useWebRTC(
    socket,
    roomId,
    localStream
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setMeetingDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    latestDataRef.current = {
      messages,
      speakingStats,
      participants,
      meetingDuration,
    };
  }, [messages, speakingStats, participants, meetingDuration]);

  const navigateToSummary = () => {
    const data = latestDataRef.current;

    navigate("/summary", {
      state: {
        roomId,
        messages: data.messages,
        speakingStats: data.speakingStats,
        participants: data.participants,
        meetingDuration: data.meetingDuration,
      },
    });
  };

  const formatTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");

    return `${h}:${m}:${s}`;
  };

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
      guest_name: userNameRef.current,
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
      participant_name: userNameRef.current,
      total_seconds: Math.round((myStats.totalSpeakingTime || 0) / 1000),
      percentage,
    });

    if (error) console.error("Speaking stats save error:", error);
  };

  // 1. Initialize Media (Runs on mount so Pre-Join has camera preview)
  useEffect(() => {
    let stream;
    const initMedia = async () => {
      try {
        setMediaError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        originalStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0];
        setLocalStream(stream);
      } catch (err) {
        console.error("Media setup error:", err);
        setMediaError(err);
      }
    };
    initMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [retryCount]);

  // 2. Connect Socket (Runs when user clicks Join Now)
  useEffect(() => {
    if (!hasJoined || !localStream) return;

    const connectSocket = async () => {
      try {
        setConnectionError(null);
        setUserName(userNameRef.current);

        const meeting = await getMeeting();
        if (!meeting) {
          alert("Meeting not found.");
          navigate("/");
          return;
        }

        meetingIdRef.current = meeting.id;

        const currentSocket = io(SERVER_URL, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          timeout: 10000,
        });

        socketRef.current = currentSocket;
        setSocket(currentSocket);

        const connectionTimer = setTimeout(() => {
          if (!currentSocket.connected) {
            setConnectionError("Could not connect to signaling server.");
          }
        }, 15000);

        currentSocket.on("connect", async () => {
          clearTimeout(connectionTimer);
          socketIdRef.current = currentSocket.id;
          currentSocket.emit("request-join-room", roomId, userNameRef.current);
        });

        currentSocket.on("user-admitted", async () => {
          setIsWaiting(false);
          setIsDenied(false);
          await saveParticipant(meeting.id, currentSocket.id);
          currentSocket.emit("join-room", roomId, userNameRef.current);
          
          currentSocket.emit("user-toggle-mute", roomId, { socketId: currentSocket.id, isMuted: isMuted });
          currentSocket.emit("user-toggle-video", roomId, { socketId: currentSocket.id, isVideoOff: isVideoOff });
        });

        currentSocket.on("user-denied", () => {
          setIsWaiting(false);
          setIsDenied(true);
        });
        
        currentSocket.on("join-request-received", (req) => {
          setJoinRequests(prev => {
            if (prev.some(r => r.socketId === req.socketId)) return prev;
            return [...prev, req];
          });
        });
        
        currentSocket.on("camera-off-requested", () => {
          const videoTrack = localStream?.getVideoTracks()[0];
          if (videoTrack && videoTrack.enabled) {
            videoTrack.enabled = false;
            setIsVideoOff(true);
            currentSocket.emit("user-toggle-video", roomId, { socketId: currentSocket.id, isVideoOff: true });
          }
        });

        currentSocket.on("connect_error", (err) => {
          console.error("Socket connection error:", err);
          setConnectionError(err.message || "Socket connection failed.");
        });

        currentSocket.on("chat-message", (senderId, message) => {
          if (senderId === currentSocket.id) return;
          const messageId = message?.id || `${senderId}-${message?.time || ""}-${message?.text || message}`;
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
        currentSocket.on("speaking-stats", (stats) => setSpeakingStats(stats));
        currentSocket.on("participants-update", (list) => setParticipants(list));
        currentSocket.on("user-left", (socketId) => {
          setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
        });
        currentSocket.on("user-toggle-mute", ({ socketId, isMuted }) => {
          setMutedUsers((prev) => ({ ...prev, [socketId]: isMuted }));
        });
        currentSocket.on("user-toggle-video", ({ socketId, isVideoOff }) => {
          setCameraOffUsers((prev) => ({ ...prev, [socketId]: isVideoOff }));
        });
        currentSocket.on("raise-hand-update", ({ socketId, raisedHand }) => {
          setRaisedHands((prev) => ({ ...prev, [socketId]: raisedHand }));
        });
        currentSocket.on("room-locked", () => {
          alert("This room is locked by the host.");
          navigate("/");
        });
        currentSocket.on("duplicate-session-closed", () => {
          alert("Your previous session was closed.");
          currentSocket.disconnect();
          navigate("/", { replace: true });
        });
        currentSocket.on("receive-reaction", (data) => {
          setFloatingReactions((prev) => [...prev, data]);
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== data.id));
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
          const audioTrack = localStream?.getAudioTracks()[0];
          if (audioTrack && audioTrack.enabled) {
            audioTrack.enabled = false;
            setIsMuted(true);
            currentSocket.emit("user-toggle-mute", roomId, { socketId: currentSocket.id, isMuted: true });
          }
        });

        const analyzer = new AudioAnalyzer(localStream, (isSpeaking) => {
          socketRef.current?.emit("speaking-state-change", roomId, isSpeaking);
        });
        analyzer.start();
        audioAnalyzerRef.current = analyzer;

      } catch (err) {
        console.error("Socket setup error:", err);
      }
    };

    connectSocket();

    return () => {
      audioAnalyzerRef.current?.stop();
      audioAnalyzerRef.current = null;

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
    };
  }, [hasJoined, roomId, navigate, localStream]);
  const toggleMute = () => {
    const audioTrack = localStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    const nextMuted = !audioTrack.enabled;
    setIsMuted(nextMuted);

    if (socketRef.current) {
      socketRef.current.emit("user-toggle-mute", roomId, {
        socketId: socketRef.current.id,
        isMuted: nextMuted,
      });
    }
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

    socketRef.current?.emit("screen-share-stopped", roomId);
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

        socketRef.current?.emit("screen-share-started", roomId);

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

    socketRef.current?.emit("raise-hand", roomId, false);

    if (isScreenSharing) {
      await stopScreenShare();
    }

    disconnectAll();

    socketRef.current?.disconnect();

    navigateToSummary();
  };

  const sendMessage = async (text) => {
    const cleanText = text.trim();
    if (!socketRef.current || !cleanText) return;

    const message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      text: cleanText,
      senderName: userNameRef.current,
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
        sender_name: userNameRef.current,
        message: cleanText,
      });

      if (error) console.error("Chat save error:", error);
    }
  };

  const sendReaction = (emoji) => {
    socketRef.current?.emit("send-reaction", roomId, emoji, userNameRef.current);
    setShowReactionPicker(false);
  };

  // Pre-Join Screen
    // Denied Screen
  if (isDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0f0f13', color: 'white', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>Host denied your request</h2>
        <p style={{ color: '#aaa', marginBottom: '24px' }}>You cannot join this meeting.</p>
        <button className="btn-secondary" onClick={() => navigate("/")}>Go to Home</button>
      </div>
    );
  }

  // Waiting Room Screen
  if (hasJoined && isWaiting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0f0f13', color: 'white', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Waiting for host to admit you...</h2>
        <p style={{ color: '#aaa', marginBottom: '32px' }}>Room: {roomId}</p>
        
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '4px solid #4f46e5', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginBottom: '32px' }}></div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        
        <button onClick={() => {
          if (socketRef.current) socketRef.current.disconnect();
          navigate("/");
        }} style={{ padding: '12px 24px', background: '#ef4444', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Leave
        </button>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="pre-join-container" style={{ display: 'flex', minHeight: '100vh', background: '#0f0f13', color: 'white', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', maxWidth: '1000px', width: '100%' }}>
          {/* Camera Preview */}
          <div style={{ flex: '1 1 500px', background: '#1e1e2e', borderRadius: '16px', overflow: 'hidden', position: 'relative', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isVideoOff ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#3b3b55', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 32 }}>{tempName ? tempName[0]?.toUpperCase() : 'U'}</span>
                </div>
                <p>Camera is off</p>
              </div>
            ) : (
              <video 
                autoPlay 
                playsInline 
                muted 
                ref={(ref) => {
                  if (ref && localStream) ref.srcObject = localStream;
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            )}
            
            <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '16px' }}>
              <button onClick={toggleMute} style={{ width: 48, height: 48, borderRadius: '50%', background: isMuted ? '#ff4d4f' : 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button onClick={toggleVideo} style={{ width: 48, height: 48, borderRadius: '50%', background: isVideoOff ? '#ff4d4f' : 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            </div>
          </div>

          {/* Join Form */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Ready to join?</h1>
            <p style={{ color: '#aaa', marginBottom: '24px' }}>Room: {roomId}</p>

            <div style={{ marginBottom: '24px', background: '#1e1e2e', padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc', marginRight: '16px' }}>
                {meetingLink}
              </div>
              <button onClick={handleCopyLink} style={{ background: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 'bold' }}>
                {showLinkToast ? "Copied!" : "Copy link"}
              </button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="Your name"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const trimmed = tempName.trim();
                    if (trimmed) {
                      setUserName(trimmed);
                      userNameRef.current = trimmed;
                      localStorage.setItem("userName", trimmed);
                      sessionStorage.setItem("lockedUserName", trimmed);
                      setNameReady(true);
                      setHasJoined(true);
                    }
                  }
                }}
                style={{
                  width: "100%", padding: "16px", fontSize: 16, borderRadius: 8,
                  border: "1px solid #444", background: "#2a2a3e", color: "#fff",
                  outline: "none", boxSizing: "border-box"
                }}
                autoFocus={!nameReady}
              />
            </div>

            <button
              onClick={() => {
                const trimmed = tempName.trim();
                if (trimmed) {
                  setUserName(trimmed);
                  userNameRef.current = trimmed;
                  localStorage.setItem("userName", trimmed);
                  sessionStorage.setItem("lockedUserName", trimmed);
                  setNameReady(true);
                  setHasJoined(true);
                } else if (nameReady && userNameRef.current) {
                  setHasJoined(true);
                } else {
                  alert("Please enter a name");
                }
              }}
              style={{
                width: "100%", padding: "16px", fontSize: 16, fontWeight: 600,
                borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff"
              }}
            >
              Join Now
            </button>
          </div>
        </div>
      </div>
    );
  }
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
          userName={userNameRef.current}
          speakingStats={speakingStats}
          localSocketId={socket?.id}
          raisedHands={raisedHands}
          participants={participants}
          mutedUsers={mutedUsers}
        />

                {/* Join Requests Toasts */}
        {joinRequests.length > 0 && (
          <div style={{ position: 'absolute', top: 80, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {joinRequests.map(req => (
              <div key={req.socketId} style={{ background: '#1e1e2e', padding: '16px', borderRadius: '12px', border: '1px solid #4f46e5', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: '300px' }}>
                <p style={{ margin: '0 0 12px 0', color: 'white', fontWeight: 'bold' }}>{req.userName} wants to join</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => {
                    socketRef.current?.emit("admit-user", roomId, req.socketId);
                    setJoinRequests(prev => prev.filter(r => r.socketId !== req.socketId));
                  }} style={{ flex: 1, padding: '8px', background: '#10b981', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Admit</button>
                  <button onClick={() => {
                    socketRef.current?.emit("deny-user", roomId, req.socketId);
                    setJoinRequests(prev => prev.filter(r => r.socketId !== req.socketId));
                  }} style={{ flex: 1, padding: '8px', background: '#ef4444', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}

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

          <div className="reaction-container" style={{ position: "relative" }}>
            <button
              className="control-btn"
              onClick={() => setShowInfoPanel(!showInfoPanel)}
              title="Meeting Info"
            >
              <span style={{fontWeight: 'bold', fontSize: '18px'}}>i</span>
            </button>
            {showInfoPanel && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: '12px', background: '#1e1e2e', padding: '16px', borderRadius: '12px', width: '250px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 10, textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'white' }}>Meeting Info</h4>
                <p style={{ margin: '0 0 8px 0', color: '#ccc', fontSize: '14px', wordBreak: 'break-all' }}>Room ID: {roomId}</p>
                <button onClick={handleCopyLink} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', width: '100%' }}>
                  {showLinkToast ? "Copied!" : "Copy Joining Info"}
                </button>
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
            <button
              className={`control-btn ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              <MessageSquare size={24} />
            </button>

            <button
              className={`control-btn ${
                activeTab === "participants" ? "active" : ""
              }`}
              onClick={() => setActiveTab("participants")}
            >
              <Users size={24} />
            </button>
          </div>
        </div>
      </div>

      {isMobilePanelOpen && <button className="mobile-panel-close" onClick={() => setIsMobilePanelOpen(false)} style={{position: 'absolute', bottom: '50vh', zIndex: 101, left: 0, right: 0}}>Close Panel</button>}
      <div className={`side-panel-wrapper ${isMobilePanelOpen ? 'open' : ''}`} style={{ display: 'contents' }}>
        <SidePanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          messages={messages}
          sendMessage={sendMessage}
          speakingStats={speakingStats}
          participants={uniqueParticipants}
          isHost={isHost}
          onMuteParticipant={(id) =>
            socketRef.current?.emit("host-mute-participant", roomId, id)
          }
          onRemoveParticipant={(id) =>
            socketRef.current?.emit("host-remove-participant", roomId, id)
          }
          onCameraOffParticipant={(id) =>
            socketRef.current?.emit("host-camera-off-participant", roomId, id)
          }
        />
      </div>
    </div>
  );
};

export default Room;
