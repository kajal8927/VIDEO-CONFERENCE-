import React, { useEffect, useRef } from "react";
import { MicOff } from "lucide-react";

const getInitials = (name) => {
  if (!name) return "U";

  const parts = name.trim().split(" ").filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return name.substring(0, 2).toUpperCase();
};

const VideoTile = ({
  stream,
  userName,
  isLocal,
  speakingStats,
  raisedHand,
  isRemoteMuted,
  isCameraOff,
  isHost,
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = Boolean(isLocal);
    video.playsInline = true;
    video.autoplay = true;

    const playVideo = () => {
      video.play().catch((err) => {
        console.warn("Video play retry:", err?.message || err);

        setTimeout(() => {
          video.play().catch(() => {});
        }, 500);
      });
    };

    playVideo();

    const handleLoadedMetadata = () => {
      playVideo();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);

      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream, isLocal]);

  const isSpeaking = speakingStats?.isSpeaking;

  return (
    <div className={`video-tile ${isSpeaking ? "speaking-active" : ""}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={Boolean(isLocal)}
        className="video-element"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
          transform: isLocal ? "scaleX(-1)" : "none",
          display: isCameraOff ? "none" : "block",
        }}
      />

      {isCameraOff && (
        <div
          className="video-element camera-off-placeholder"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#2a2a3e",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "#3b3b55",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              color: "white",
            }}
          >
            {getInitials(userName)}
          </div>
        </div>
      )}

      {raisedHand && <div className="raised-hand-badge">✋</div>}

      <div
        className="video-overlay"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>{isLocal ? `${userName} (You)` : userName}</span>

        {isHost && (
          <span
            className="host-badge"
            style={{
              background: "#4f46e5",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: "bold",
            }}
          >
            Host
          </span>
        )}

        {isRemoteMuted ? (
          <MicOff size={16} color="#ff4d4f" />
        ) : isSpeaking ? (
          <div className="mic-bars">
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VideoTile;