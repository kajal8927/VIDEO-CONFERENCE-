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
        ([socketId, { stream, isLocal }]) => {
          const participant = participants.find((p) => p.socketId === socketId);
          const realName = isLocal ? userName : participant?.userName || "Guest";
          const isParticipantHost = isLocal ? localIsHost : !!participant?.isHost;

          return (
            <VideoTile
              key={socketId}
              stream={stream}
              userName={realName}
              isLocal={!!isLocal}
              speakingStats={speakingStats?.[socketId] ?? {}}
              raisedHand={!!raisedHands?.[socketId]}
              isRemoteMuted={!!mutedUsers?.[socketId]}
              isCameraOff={!!cameraOffUsers?.[socketId]}
              isHost={isParticipantHost}
            />
          );
        }
      )}
    </div>
  );
};

export default VideoGrid;