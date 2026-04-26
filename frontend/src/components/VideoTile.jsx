import React, { useEffect, useRef } from 'react';

const VideoTile = ({ stream, userName, isSpeaking, isLocal }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-tile ${isSpeaking ? 'speaking-active' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Mute local video to avoid echo
        className={isLocal ? 'mirrored' : ''}
      />
      <div className="video-overlay">
        <span className="user-name-badge">
          {userName} {isLocal && '(You)'}
        </span>
      </div>
    </div>
  );
};

export default VideoTile;
