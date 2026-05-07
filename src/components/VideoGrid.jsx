import React from "react";
import VideoTile from "./VideoTile";

const VideoGrid = ({
  localStream,
  remoteStreams = {},
  userName,
  speakingStats = {},
  localSocketId,
  raisedHands = {},
  participants = [],
  mutedUsers = {},
  cameraOffUsers = {},
  localIsHost = false,
}) => {
  const allStreams = {};

  if (localSocketId && localStream) {
    allStreams[localSocketId] = {
      stream: localStream,
      userName,
      isLocal: true,
    };
  }

  Object.entries(remoteStreams || {}).forEach(([socketId, data]) => {
    if (!data?.stream) return;

    allStreams[socketId] = {
      ...data,
      isLocal: false,
    };
  });

  return (
    <div className="video-grid">
      {Object.entries(allStreams).map(([socketId, data]) => {
        const participant = participants.find((p) => p.socketId === socketId);

        const realName = data.isLocal
          ? userName
          : participant?.userName || data.userName || "Guest";

        const isParticipantHost = data.isLocal
          ? localIsHost
          : Boolean(participant?.isHost);

        return (
          <VideoTile
            key={socketId}
            stream={data.stream}
            userName={realName}
            isLocal={Boolean(data.isLocal)}
            speakingStats={speakingStats?.[socketId] ?? {}}
            raisedHand={Boolean(raisedHands?.[socketId])}
            isRemoteMuted={Boolean(mutedUsers?.[socketId])}
            isCameraOff={Boolean(cameraOffUsers?.[socketId])}
            isHost={isParticipantHost}
          />
        );
      })}
    </div>
  );
};

export default VideoGrid;