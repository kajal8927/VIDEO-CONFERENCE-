import { useState, useEffect, useRef, useCallback } from "react";

const envTurnUrls = import.meta.env.VITE_TURN_URLS;
const envTurnUsername = import.meta.env.VITE_TURN_USERNAME;
const envTurnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

const turnUrls = envTurnUrls
  ? envTurnUrls.split(",").map((url) => url.trim()).filter(Boolean)
  : [];

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(turnUrls.length && envTurnUsername && envTurnCredential
      ? [
          {
            urls: turnUrls,
            username: envTurnUsername,
            credential: envTurnCredential,
          },
        ]
      : []),
  ],
  iceCandidatePoolSize: 10,
};

const logTracks = (label, stream) => {
  if (!stream) {
    console.warn(`[WebRTC] ${label}: no stream`);
    return;
  }

  console.log(
    `[WebRTC] ${label}:`,
    stream.getTracks().map((track) => ({
      kind: track.kind,
      enabled: track.enabled,
      readyState: track.readyState,
      muted: track.muted,
      id: track.id,
    }))
  );
};

export const useWebRTC = (socket, roomId, localStream) => {
  const [streams, setStreams] = useState({});
  const peersRef = useRef({});
  const remoteStreamsRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const disconnectTimersRef = useRef({});
  const localStreamRef = useRef(localStream);

  useEffect(() => {
    localStreamRef.current = localStream;

    if (localStream) {
      logTracks("localStream updated", localStream);
    }

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
        } else {
          peer.addTrack(track, localStream);
        }
      });
    });
  }, [localStream]);

  const safeClosePeer = useCallback((targetId) => {
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
    delete remoteStreamsRef.current[targetId];

    setStreams((prev) => {
      const copy = { ...prev };
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

  const makeOffer = useCallback(
    async (peer, targetId, options = {}) => {
      try {
        const offer = await peer.createOffer(options);
        await peer.setLocalDescription(offer);
        socket.emit("offer", targetId, peer.localDescription);
        console.log("[WebRTC] offer sent:", targetId);
      } catch (err) {
        console.error("[WebRTC] Error creating offer:", err);
      }
    },
    [socket]
  );

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
        logTracks("adding local tracks before offer", stream);

        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
          console.log("[WebRTC] added local track:", {
            targetId,
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
          });
        });
      } else {
        console.warn("[WebRTC] No localStream while creating peer:", targetId);
      }

      peer.ontrack = (event) => {
        if (!remoteStreamsRef.current[targetId]) {
          remoteStreamsRef.current[targetId] = new MediaStream();
        }

        const remoteStream = remoteStreamsRef.current[targetId];

        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }

        console.log("[WebRTC] Remote track received:", {
          targetId,
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted,
        });

        logTracks("remote stream tracks", remoteStream);

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

        if (
          peer.iceConnectionState === "connected" ||
          peer.iceConnectionState === "completed"
        ) {
          if (disconnectTimersRef.current[targetId]) {
            clearTimeout(disconnectTimersRef.current[targetId]);
            delete disconnectTimersRef.current[targetId];
          }
        }

        if (peer.iceConnectionState === "failed") {
          console.warn("[WebRTC] ICE failed:", targetId);

          if (isInitiator) {
            try {
              peer.restartIce?.();
              makeOffer(peer, targetId, { iceRestart: true });
            } catch (err) {
              console.error("[WebRTC] ICE restart error:", err);
            }
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
              console.warn("[WebRTC] Peer stayed disconnected:", targetId);
              safeClosePeer(targetId);
            }
          }, 30000);
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
      };

      if (isInitiator) {
        makeOffer(peer, targetId);
      }

      return peer;
    },
    [socket, makeOffer, safeClosePeer]
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
        if (peer.signalingState !== "stable") {
          console.warn("[WebRTC] Peer not stable before offer, rolling back:", {
            userId,
            signalingState: peer.signalingState,
          });

          await peer.setLocalDescription({ type: "rollback" }).catch(() => {});
        }

        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingCandidates(userId, peer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("answer", userId, peer.localDescription);
        console.log("[WebRTC] answer sent:", userId);
      } catch (err) {
        console.error("[WebRTC] Error handling offer:", err);
      }
    };

    const handleAnswer = async (userId, answer) => {
      console.log("[WebRTC] answer received:", userId);

      const peer = peersRef.current[userId];
      if (!peer || peer.signalingState === "closed") return;

      try {
        if (peer.signalingState === "have-local-offer") {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingCandidates(userId, peer);
        } else {
          console.warn("[WebRTC] Ignoring answer in state:", {
            userId,
            signalingState: peer.signalingState,
          });
        }
      } catch (err) {
        console.error("[WebRTC] Error handling answer:", err);
      }
    };

    const handleIceCandidate = async (userId, candidate) => {
      const peer = peersRef.current[userId];

      if (!peer || peer.signalingState === "closed" || !peer.remoteDescription) {
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
      safeClosePeer(userId);
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
      remoteStreamsRef.current = {};
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
    remoteStreamsRef.current = {};

    setStreams({});
  }, []);

  return { streams, disconnectAll, replaceVideoTrack };
};