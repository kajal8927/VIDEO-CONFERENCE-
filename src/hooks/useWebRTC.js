import { useState, useEffect, useRef, useCallback } from "react";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

export const useWebRTC = (socket, roomId, localStream) => {
  const [streams, setStreams] = useState({});
  const peersRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const disconnectTimersRef = useRef({});
  const localStreamRef = useRef(localStream);

  useEffect(() => {
    localStreamRef.current = localStream;

    Object.values(peersRef.current).forEach((peer) => {
      if (!localStream) return;

      localStream.getTracks().forEach((track) => {
        const sender = peer
          .getSenders()
          .find((s) => s.track && s.track.kind === track.kind);

        if (sender) {
          sender.replaceTrack(track).catch((err) => {
            console.error("[WebRTC] replaceTrack error:", err);
          });
        }
      });
    });
  }, [localStream]);

  const safeClosePeer = useCallback((targetId, shouldStopStream = false) => {
    const peer = peersRef.current[targetId];

    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.oniceconnectionstatechange = null;
      peer.onconnectionstatechange = null;
      peer.close();
      delete peersRef.current[targetId];
    }

    if (disconnectTimersRef.current[targetId]) {
      clearTimeout(disconnectTimersRef.current[targetId]);
      delete disconnectTimersRef.current[targetId];
    }

    delete pendingCandidatesRef.current[targetId];

    setStreams((prev) => {
      const copy = { ...prev };

      if (shouldStopStream && copy[targetId]?.stream) {
        copy[targetId].stream.getTracks().forEach((track) => track.stop());
      }

      delete copy[targetId];
      return copy;
    });
  }, []);

  const flushPendingCandidates = useCallback(async (targetId, peer) => {
    const candidates = pendingCandidatesRef.current[targetId] || [];

    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC] Error adding queued ICE candidate:", err);
      }
    }

    delete pendingCandidatesRef.current[targetId];
  }, []);

  const createPeer = useCallback(
    (targetId, isInitiator) => {
      if (!socket || !targetId || targetId === socket.id) return null;

      const existingPeer = peersRef.current[targetId];
      if (existingPeer && existingPeer.signalingState !== "closed") {
        return existingPeer;
      }

      console.log("[WebRTC] Creating peer:", { targetId, isInitiator });

      const peer = new RTCPeerConnection(configuration);
      peersRef.current[targetId] = peer;

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          const alreadyAdded = peer
            .getSenders()
            .some((sender) => sender.track && sender.track.id === track.id);

          if (!alreadyAdded) {
            peer.addTrack(track, stream);
          }
        });
      }

      peer.ontrack = (event) => {
        const [remoteStream] = event.streams;

        if (!remoteStream) {
          console.warn("[WebRTC] ontrack fired without remote stream:", targetId);
          return;
        }

        console.log("[WebRTC] Remote track received:", {
          targetId,
          tracks: remoteStream.getTracks().map((t) => `${t.kind}:${t.readyState}`),
        });

        setStreams((prev) => ({
          ...prev,
          [targetId]: {
            stream: remoteStream,
            userName: prev[targetId]?.userName || "Participant",
            isLocal: false,
          },
        }));
      };

      peer.onicecandidate = (event) => {
        if (event.candidate && socket?.connected) {
          socket.emit("ice-candidate", targetId, event.candidate);
        }
      };

      peer.oniceconnectionstatechange = () => {
        console.log("[WebRTC] ICE state:", targetId, peer.iceConnectionState);

        if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
          if (disconnectTimersRef.current[targetId]) {
            clearTimeout(disconnectTimersRef.current[targetId]);
            delete disconnectTimersRef.current[targetId];
          }
        }

        if (peer.iceConnectionState === "failed") {
          console.warn("[WebRTC] ICE failed, restarting:", targetId);

          try {
            peer.restartIce?.();
          } catch (err) {
            console.error("[WebRTC] restartIce error:", err);
          }

          if (isInitiator) {
            peer
              .createOffer({ iceRestart: true })
              .then((offer) => peer.setLocalDescription(offer))
              .then(() => {
                socket.emit("offer", targetId, peer.localDescription);
              })
              .catch((err) => console.error("[WebRTC] ICE restart offer error:", err));
          }
        }

        if (peer.iceConnectionState === "disconnected") {
          if (disconnectTimersRef.current[targetId]) return;

          disconnectTimersRef.current[targetId] = setTimeout(() => {
            const currentPeer = peersRef.current[targetId];

            if (
              currentPeer &&
              (currentPeer.iceConnectionState === "disconnected" ||
                currentPeer.iceConnectionState === "failed" ||
                currentPeer.iceConnectionState === "closed")
            ) {
              console.warn("[WebRTC] Peer stayed disconnected, cleaning:", targetId);
              safeClosePeer(targetId, false);
            }
          }, 10000);
        }
      };

      peer.onconnectionstatechange = () => {
        console.log("[WebRTC] Connection state:", targetId, peer.connectionState);

        if (peer.connectionState === "connected") {
          if (disconnectTimersRef.current[targetId]) {
            clearTimeout(disconnectTimersRef.current[targetId]);
            delete disconnectTimersRef.current[targetId];
          }
        }

        if (peer.connectionState === "failed") {
          console.warn("[WebRTC] Connection failed:", targetId);
        }
      };

      if (isInitiator) {
        peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            socket.emit("offer", targetId, peer.localDescription);
          })
          .catch((err) => console.error("[WebRTC] Error creating offer:", err));
      }

      return peer;
    },
    [socket, safeClosePeer]
  );

  useEffect(() => {
    if (!socket) return;

    const handleRoomUsers = (users = []) => {
      console.log("[WebRTC] room-users:", users);

      users.forEach((userId) => {
        if (userId && userId !== socket.id) {
          createPeer(userId, true);
        }
      });
    };

    const handleUserJoined = (userId) => {
      console.log("[WebRTC] user-joined:", userId);

      if (userId && userId !== socket.id) {
        createPeer(userId, false);
      }
    };

    const handleOffer = async (userId, offer) => {
      console.log("[WebRTC] offer received:", userId);

      let peer = peersRef.current[userId];
      if (!peer || peer.signalingState === "closed") {
        peer = createPeer(userId, false);
      }

      if (!peer) return;

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingCandidates(userId, peer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("answer", userId, peer.localDescription);
      } catch (err) {
        console.error("[WebRTC] Error handling offer:", err);
      }
    };

    const handleAnswer = async (userId, answer) => {
      console.log("[WebRTC] answer received:", userId);

      const peer = peersRef.current[userId];
      if (!peer || peer.signalingState === "closed") return;

      try {
        if (peer.signalingState !== "stable") {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingCandidates(userId, peer);
        }
      } catch (err) {
        console.error("[WebRTC] Error handling answer:", err);
      }
    };

    const handleIceCandidate = async (userId, candidate) => {
      const peer = peersRef.current[userId];

      if (!peer || peer.signalingState === "closed") {
        pendingCandidatesRef.current[userId] = [
          ...(pendingCandidatesRef.current[userId] || []),
          candidate,
        ];
        return;
      }

      if (!peer.remoteDescription) {
        pendingCandidatesRef.current[userId] = [
          ...(pendingCandidatesRef.current[userId] || []),
          candidate,
        ];
        return;
      }

      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC] Error adding received ICE candidate:", err);
      }
    };

    const handleUserLeft = (userId) => {
      console.log("[WebRTC] user-left cleanup:", userId);
      safeClosePeer(userId, true);
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

      Object.keys(disconnectTimersRef.current).forEach((targetId) => {
        clearTimeout(disconnectTimersRef.current[targetId]);
      });

      Object.values(peersRef.current).forEach((peer) => peer.close());

      disconnectTimersRef.current = {};
      pendingCandidatesRef.current = {};
      peersRef.current = {};
      setStreams({});
    };
  }, [socket, createPeer, flushPendingCandidates, safeClosePeer]);

  const replaceVideoTrack = useCallback(async (newVideoTrack) => {
    const replacements = Object.values(peersRef.current).map(async (peer) => {
      const sender = peer
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");

      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
    });

    await Promise.allSettled(replacements);
  }, []);

  const disconnectAll = useCallback(() => {
    Object.keys(disconnectTimersRef.current).forEach((targetId) => {
      clearTimeout(disconnectTimersRef.current[targetId]);
    });

    Object.values(peersRef.current).forEach((peer) => peer.close());

    peersRef.current = {};
    disconnectTimersRef.current = {};
    pendingCandidatesRef.current = {};

    setStreams({});
  }, []);

  return { streams, disconnectAll, replaceVideoTrack };
};