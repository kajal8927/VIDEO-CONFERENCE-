import React from "react";
import VideoTile from "./VideoTile";

const VideoGrid = ({
  localStream,
  remoteStreams = {},
  userName,
  speakingStats = {},
  localSocketId,
  raisedHands = {},
}) => {
  const allStreams = {
    ...(localSocketId
      ? {
          [localSocketId]: {
            stream: localStream,
            userName,
            isLocal: true,
          },
        }
      : {}),
    ...remoteStreams,
  };

  return (
    <div className="video-grid">
      {Object.entries(allStreams).map(
        ([socketId, { stream, userName: name, isLocal }]) => (
          <VideoTile
            key={socketId}
            stream={stream}
            userName={name || "Guest"}
            isLocal={!!isLocal}
            speakingStats={speakingStats?.[socketId] ?? {}}
            raisedHand={!!raisedHands?.[socketId]}
          />
        )
      )}
    </div>
  );
};

export default VideoGrid;