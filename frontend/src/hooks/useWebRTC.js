import { useState, useEffect, useRef, useCallback } from "react";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export const useWebRTC = (socket, roomId, localStream) => {
  const [streams, setStreams] = useState({});
  const peersRef = useRef({});
  const localStreamRef = useRef(localStream);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const createPeer = useCallback(
    (targetId, isInitiator) => {
      const peer = new RTCPeerConnection(configuration);
      peersRef.current[targetId] = peer;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          peer.addTrack(track, localStreamRef.current);
        });
      }

      peer.ontrack = (event) => {
        setStreams((prev) => ({
          ...prev,
          [targetId]: {
            stream: event.streams[0],
            userName: "Participant",
            isLocal: false,
          },
        }));
      };

      peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", targetId, event.candidate);
        }
      };

      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === "failed" || peer.iceConnectionState === "disconnected") {
          console.warn(`Peer connection with ${targetId} state: ${peer.iceConnectionState}. Cleaning up.`);
          if (peersRef.current[targetId]) {
            peersRef.current[targetId].close();
            delete peersRef.current[targetId];
          }
          setStreams((prev) => {
            const copy = { ...prev };
            if (copy[targetId] && copy[targetId].stream) {
              copy[targetId].stream.getTracks().forEach((t) => t.stop());
            }
            delete copy[targetId];
            return copy;
          });
        }
      };

      if (isInitiator) {
        peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            socket.emit("offer", targetId, peer.localDescription);
          })
          .catch((err) => console.error("Error creating offer:", err));
      }

      return peer;
    },
    [socket]
  );

  useEffect(() => {
    if (!socket) return;

    const handleRoomUsers = (users) => {
      users.forEach((userId) => {
        if (!peersRef.current[userId]) createPeer(userId, true);
      });
    };

    const handleUserJoined = (userId) => {
      if (!peersRef.current[userId]) createPeer(userId, false);
    };

    const handleOffer = async (userId, offer) => {
      let peer = peersRef.current[userId];
      if (!peer) peer = createPeer(userId, false);

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("answer", userId, peer.localDescription);
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    };

    const handleAnswer = async (userId, answer) => {
      const peer = peersRef.current[userId];

      if (peer) {
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error("Error handling answer:", err);
        }
      }
    };

    const handleIceCandidate = async (userId, candidate) => {
      const peer = peersRef.current[userId];

      if (peer) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding received ICE candidate:", err);
        }
      }
    };

    const handleUserLeft = (userId) => {
      const peer = peersRef.current[userId];

      if (peer) {
        peer.close();
        delete peersRef.current[userId];
      }

      setStreams((prev) => {
        const copy = { ...prev };
        if (copy[userId] && copy[userId].stream) {
          copy[userId].stream.getTracks().forEach((track) => track.stop());
        }
        delete copy[userId];
        return copy;
      });
    };

    socket.on("room-users", handleRoomUsers);
    socket.on("user-joined", handleUserJoined);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("user-left", handleUserLeft);

    return () => {
      socket.off("room-users", handleRoomUsers);
      socket.off("user-joined", handleUserJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("user-left", handleUserLeft);

      Object.values(peersRef.current).forEach((peer) => peer.close());
      peersRef.current = {};
      setStreams({});
    };
  }, [socket, createPeer]);

  const replaceVideoTrack = useCallback(async (newVideoTrack) => {
    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");

      if (sender) sender.replaceTrack(newVideoTrack);
    });
  }, []);

  const disconnectAll = useCallback(() => {
    Object.values(peersRef.current).forEach((peer) => peer.close());
    peersRef.current = {};
    
    setStreams((prev) => {
      Object.values(prev).forEach((streamObj) => {
        if (streamObj.stream) {
          streamObj.stream.getTracks().forEach((track) => track.stop());
        }
      });
      return {};
    });
  }, []);

  return { streams, disconnectAll, replaceVideoTrack };
};