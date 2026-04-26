import { useState, useEffect, useRef, useCallback } from 'react';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const useWebRTC = (socket, roomId, localStream) => {
  const [streams, setStreams] = useState({});
  const peersRef = useRef({});

  const createPeer = useCallback((targetId, isInitiator) => {
    console.log(`Creating peer for ${targetId}, isInitiator: ${isInitiator}`);
    const peer = new RTCPeerConnection(configuration);
    peersRef.current[targetId] = peer;

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
      });
    }

    peer.ontrack = (event) => {
      console.log(`Received track from ${targetId}`);
      setStreams(prev => ({
        ...prev,
        [targetId]: event.streams[0]
      }));
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', targetId, event.candidate);
      }
    };

    if (isInitiator) {
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
          socket.emit('offer', targetId, peer.localDescription);
        })
        .catch(err => console.error('Error creating offer:', err));
    }

    return peer;
  }, [socket, localStream]);

  useEffect(() => {
    if (!socket || !localStream) return;

    const handleRoomUsers = (users) => {
      console.log('Existing room users:', users);
      users.forEach(userId => {
        if (!peersRef.current[userId]) {
          createPeer(userId, true);
        }
      });
    };

    const handleUserJoined = (userId) => {
      console.log('User joined:', userId);
      // Wait for the other user to create an offer, or create peer without offer?
      // Actually, if we are the existing user, the new user will initiate the offer 
      // if we follow the logic: existing users wait, new user initiates?
      // Wait, let's stick to: new user initiates offer to all existing users.
      // So existing user just creates the peer and waits for the offer.
      if (!peersRef.current[userId]) {
        createPeer(userId, false);
      }
    };

    const handleOffer = async (userId, offer) => {
      console.log('Received offer from', userId);
      let peer = peersRef.current[userId];
      if (!peer) {
        peer = createPeer(userId, false);
      }
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('answer', userId, peer.localDescription);
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    };

    const handleAnswer = async (userId, answer) => {
      console.log('Received answer from', userId);
      const peer = peersRef.current[userId];
      if (peer) {
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error handling answer:', err);
        }
      }
    };

    const handleIceCandidate = async (userId, candidate) => {
      const peer = peersRef.current[userId];
      if (peer) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      }
    };

    const handleUserLeft = (userId) => {
      console.log('User left:', userId);
      const peer = peersRef.current[userId];
      if (peer) {
        peer.close();
        delete peersRef.current[userId];
      }
      setStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[userId];
        return newStreams;
      });
    };

    socket.on('room-users', handleRoomUsers);
    socket.on('user-joined', handleUserJoined);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('room-users', handleRoomUsers);
      socket.off('user-joined', handleUserJoined);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, localStream, createPeer]);

  const disconnectAll = useCallback(() => {
     Object.values(peersRef.current).forEach(peer => peer.close());
     peersRef.current = {};
     setStreams({});
  }, []);

  return { streams, disconnectAll };
};
