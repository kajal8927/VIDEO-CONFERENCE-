import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ArrowLeft, Calendar, Users, Clock, MessageSquare, BarChart } from "lucide-react";

const History = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("meetings")
        .select(`
          *,
          meeting_participants(*),
          chat_messages(*),
          speaking_stats(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error("Error fetching meetings:", err);
      setError(err.message || "Failed to load meeting history.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div className="history-container">
      <div className="history-header">
        <button onClick={() => navigate("/")} className="back-btn">
          <ArrowLeft size={20} /> Back to Home
        </button>
        <h1 className="gradient-text">Meeting History</h1>
        <p className="subtitle">Review your past collaborations and speaking analytics</p>
      </div>

      {loading ? (
        <div className="loading-state">Loading meetings...</div>
      ) : error ? (
        <div className="error-state">
          <p>{error}</p>
          <button onClick={fetchMeetings} className="btn-secondary">Retry</button>
        </div>
      ) : (
        <div className="meetings-grid">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="meeting-card glass-panel">
              <div className="meeting-card-header">
                <h3>{meeting.title || "NovaMeet Session"}</h3>
                <span className={`status-badge ${meeting.status}`}>
                  {meeting.status}
                </span>
              </div>

              <div className="meeting-details">
                <div className="detail-item">
                  <Calendar size={16} />
                  <span>{formatDate(meeting.created_at)}</span>
                </div>
                <div className="detail-item">
                  <Users size={16} />
                  <span>{meeting.meeting_participants?.length || 0} Participants</span>
                </div>
                <div className="detail-item">
                  <MessageSquare size={16} />
                  <span>{meeting.chat_messages?.length || 0} Messages</span>
                </div>
              </div>

              <div className="analytics-preview">
                <h4><BarChart size={14} /> Speaking Stats</h4>
                {meeting.speaking_stats && meeting.speaking_stats.length > 0 ? (
                  <div className="mini-stats">
                    {meeting.speaking_stats.slice(0, 3).map((stat, i) => (
                      <div key={i} className="mini-stat-item">
                        <span>{stat.participant_name}</span>
                        <span>{stat.percentage}%</span>
                      </div>
                    ))}
                    {meeting.speaking_stats.length > 3 && (
                      <div className="more-stats">+{meeting.speaking_stats.length - 3} more</div>
                    )}
                  </div>
                ) : (
                  <p className="no-data">No speaking data recorded.</p>
                )}
              </div>
            </div>
          ))}

          {meetings.length === 0 && (
            <div className="empty-state">
              <Clock size={48} className="empty-icon" />
              <p>No meetings found in your history.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default History;
