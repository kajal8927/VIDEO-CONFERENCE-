import React, { useEffect, useRef } from "react";

const VideoTile = ({ stream, userName, isLocal, speakingStats, raisedHand }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;

      videoRef.current
        .play()
        .catch((err) => console.error("Video play error:", err));
    }
  }, [stream]);

  const isSpeaking = speakingStats?.isSpeaking;

  return (
    <div className={`video-tile ${isSpeaking ? "speaking" : ""}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="video-element"
      />

      {raisedHand && <div className="raised-hand-badge">✋</div>}

      <div className="video-overlay">
        <span>{isLocal ? `${userName} (You)` : userName}</span>

        {isSpeaking && <span className="speaking-dot">Speaking</span>}
      </div>
    </div>
  );
};

export default VideoTile;