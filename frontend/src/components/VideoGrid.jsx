import React from 'react';
import VideoTile from './VideoTile';

const VideoGrid = ({ localStream, remoteStreams, userName, speakingStats, localSocketId }) => {
  const remoteEntries = Object.entries(remoteStreams);
  
  // Determine layout class based on total number of participants (1 local + N remotes)
  const totalParticipants = 1 + remoteEntries.length;
  let gridClass = 'grid-1';
  if (totalParticipants === 2) gridClass = 'grid-2';
  else if (totalParticipants === 3 || totalParticipants === 4) gridClass = 'grid-4';
  else if (totalParticipants > 4) gridClass = 'grid-more';

  const isLocalSpeaking = speakingStats[localSocketId]?.isSpeaking || false;

  return (
    <div className={`video-grid-container ${gridClass}`}>
      <VideoTile 
        stream={localStream} 
        userName={userName} 
        isLocal={true} 
        isSpeaking={isLocalSpeaking} 
      />
      
      {remoteEntries.map(([socketId, stream]) => {
        const stats = speakingStats[socketId];
        const remoteUserName = stats ? stats.userName : 'Participant';
        const isSpeaking = stats ? stats.isSpeaking : false;

        return (
          <VideoTile 
            key={socketId}
            stream={stream}
            userName={remoteUserName}
            isLocal={false}
            isSpeaking={isSpeaking}
          />
        );
      })}
    </div>
  );
};

export default VideoGrid;
