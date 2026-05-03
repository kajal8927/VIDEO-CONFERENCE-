import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Video, Users, ArrowRight, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";

const Home = () => {
  const navigate = useNavigate();
  const { roomId: sharedRoomId } = useParams();

  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sharedRoomId) {
      setRoomId(sharedRoomId.trim());
    }
  }, [sharedRoomId]);

  const handleCreateRoom = async () => {
    const cleanUserName = userName.trim();

    if (!cleanUserName) {
      alert("Please enter your name first.");
      return;
    }

    try {
      setLoading(true);

      const newRoomId = Math.random().toString(36).substring(2, 8);

      const { error } = await supabase.from("meetings").insert({
        room_code: newRoomId,
        title: "NovaMeet Meeting",
        status: "active",
      });

      if (error) {
        console.error("Meeting create error:", error);
        alert(`Meeting create failed: ${error.message || "Unknown error"}`);
        return;
      }

      sessionStorage.setItem("isCreator", "true");
      sessionStorage.setItem("creatorRoomId", newRoomId);
      sessionStorage.setItem("lockedUserName", cleanUserName);
      localStorage.setItem("userName", cleanUserName);

      navigate(`/room/${newRoomId}`, {
        replace: true,
        state: {
          userName: cleanUserName,
          isCreator: true,
          creatorRoomId: newRoomId,
        },
      });
    } catch (err) {
      console.error("Unexpected create room error:", err);
      alert(
        `Something went wrong: ${
          err.message || "Please check your connection."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();

    const cleanUserName = userName.trim();
    const cleanRoomId = roomId.trim();

    if (!cleanUserName) {
      alert("Please enter your name first.");
      return;
    }

    if (!cleanRoomId) {
      alert("Please enter a Room ID.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("meetings")
        .select("id, room_code, status")
        .eq("room_code", cleanRoomId)
        .maybeSingle();

      if (error) {
        console.error("Room lookup error:", error);
        alert("Could not verify room. Please try again.");
        return;
      }

      if (!data) {
        alert("Room not found.");
        return;
      }

      if (data.status && data.status !== "active") {
        alert("This meeting has ended.");
        return;
      }

      sessionStorage.removeItem("isCreator");
      sessionStorage.removeItem("creatorRoomId");
      sessionStorage.setItem("lockedUserName", cleanUserName);
      localStorage.setItem("userName", cleanUserName);

      navigate(`/room/${cleanRoomId}`, {
        replace: true,
        state: {
          userName: cleanUserName,
          joinedByRoomId: true,
        },
      });
    } catch (err) {
      console.error("Unexpected join room error:", err);
      alert("Something went wrong while joining meeting.");
    } finally {
      setLoading(false);
    }
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
              disabled={loading}
            />
          </div>

          <div className="actions-divider">
            <span>Start a meeting</span>
          </div>

          <button
            onClick={handleCreateRoom}
            className="btn-primary full-width"
            disabled={loading}
          >
            <Video size={20} />
            {loading ? "Please wait..." : "New Meeting"}
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
              disabled={loading}
            />

            <button type="submit" className="btn-secondary" disabled={loading}>
              {loading ? "Joining..." : "Join"} <ArrowRight size={18} />
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

        <div className="history-link-container">
          <button onClick={() => navigate("/history")} className="btn-ghost">
            <Clock size={16} /> View Meeting History
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;