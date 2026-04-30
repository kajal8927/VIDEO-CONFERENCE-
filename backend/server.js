const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  cors({
    origin:[ "http://localhost:5173",
     "https://video-conference-ozyy.onrender.com"
    ],
    credentials:true
  })
);

app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(apiLimiter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:[
       "http://localhost:5173",
       "https://video-conference-ozyy.onrender.com"
    ],
    methods: ["GET", "POST"],
  },
});

app.post("/api/summary", async (req, res) => {
  try {
    const { roomId, messages = [], speakingStats = {} } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const spokenNames = Object.values(speakingStats)
      .filter((s) => s.totalSpeakingTime > 3000)
      .map((s) => s.userName);

    const activeParticipants = spokenNames.length > 0 ? spokenNames : ["everyone"];
    let dominantSpeaker = null;
    let maxTime = 0;
    
    for (const stat of Object.values(speakingStats)) {
       if (stat.totalSpeakingTime > maxTime) {
           maxTime = stat.totalSpeakingTime;
           dominantSpeaker = stat.userName;
       }
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (openaiApiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            messages: [
              {
                role: "system",
                content: "You are an AI meeting assistant. Generate a JSON response with three keys: 'summary' (a brief paragraph summarizing the meeting), 'keyPoints' (an array of 3-5 string bullet points), and 'actionItems' (an array of string actionable tasks based on the chat). If the chat is empty, generate generic points about a brief sync."
              },
              {
                role: "user",
                content: `Meeting Room: ${roomId}\nParticipants: ${activeParticipants.join(", ")}\nDominant Speaker: ${dominantSpeaker || 'None'}\nChat Log:\n${messages.map(m => `${m.senderName}: ${m.text}`).join("\n")}`
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
           const aiContent = JSON.parse(data.choices[0].message.content);
           return res.json({
             summary: aiContent.summary,
             keyPoints: aiContent.keyPoints || [],
             actionItems: aiContent.actionItems || [],
             participantInsights: dominantSpeaker ? [`${dominantSpeaker} was the dominant speaker.`] : []
           });
        }
      } catch (err) {
        console.error("OpenAI API Error, falling back to rule-based:", err);
      }
    }

    const chatTopics = messages.length > 0
      ? messages.map((m) => m.text).slice(0, 3).join(", ")
      : "general topics";

    const ruleBasedSummary = {
      summary: `This meeting involved key participants: ${activeParticipants.join(", ")}. The discussion mainly touched upon ${chatTopics}. Overall, it was a productive session with active engagement.`,
      keyPoints: [
        "Reviewed recent updates and general progress.",
        messages.length > 0 ? "Addressed topics mentioned in the chat." : "Standard team sync.",
        dominantSpeaker ? `${dominantSpeaker} led a significant portion of the conversation.` : "Participation was relatively balanced."
      ],
      actionItems: [
        "Follow up on topics discussed in the chat.",
        "Schedule the next sync if necessary.",
      ],
      participantInsights: [
        dominantSpeaker ? `Dominant speaker: ${dominantSpeaker}` : "No clear dominant speaker.",
        `Total active speakers: ${spokenNames.length}`
      ]
    };

    res.json(ruleBasedSummary);
  } catch (error) {
    console.error("Summary Generation Error:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.get('/', (req, res) => {
  res.send('Backend is working!');
});

const socketRateLimits = {};

const checkSocketRateLimit = (socketId) => {
  const now = Date.now();

  if (!socketRateLimits[socketId]) {
    socketRateLimits[socketId] = [];
  }

  socketRateLimits[socketId] = socketRateLimits[socketId].filter(
    (time) => now - time < 1000
  );

  if (socketRateLimits[socketId].length >= 10) {
    return false;
  }

  socketRateLimits[socketId].push(now);
  return true;
};

const sanitizeString = (value, maxLength = 200) => {
  if (typeof value !== "string") return "";
  return value.trim().substring(0, maxLength);
};

// rooms[roomId] = {
//   users: {
//     socketId: {
//       socketId,
//       userName,
//       totalSpeakingTime,
//       isSpeaking,
//       lastStartedSpeakingAt,
//       raisedHand
//     }
//   },
//   host: socketId,
//   locked: false
// }

const rooms = {};

function getRoomParticipants(roomId) {
  if (!rooms[roomId]) return [];

  return Object.values(rooms[roomId].users).map((user) => ({
    socketId: user.socketId,
    userName: user.userName,
    isHost: rooms[roomId].host === user.socketId,
    raisedHand: !!user.raisedHand,
  }));
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", (rawRoomId, rawUserName) => {
    if (!checkSocketRateLimit(socket.id)) return;

    const roomId = sanitizeString(rawRoomId, 50);
    const userName = sanitizeString(rawUserName, 50) || "Anonymous";

    if (!roomId) return;

    if (rooms[roomId]?.locked) {
      socket.emit("room-locked");
      return;
    }

    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: {},
        host: socket.id,
        locked: false,
      };
    }

    rooms[roomId].users[socket.id] = {
      socketId: socket.id,
      userName,
      totalSpeakingTime: 0,
      isSpeaking: false,
      lastStartedSpeakingAt: null,
      raisedHand: false,
    };

    socket.roomId = roomId;
    socket.userName = userName;

    const existingUsers = Object.keys(rooms[roomId].users).filter(
      (id) => id !== socket.id
    );

    const isHost = rooms[roomId].host === socket.id;

    socket.emit("room-users", existingUsers);
    socket.emit("host-status", isHost);
    socket.emit("participants-update", getRoomParticipants(roomId));

    socket.to(roomId).emit("user-joined", socket.id, userName);
    socket.to(roomId).emit("participants-update", getRoomParticipants(roomId));

    console.log(
      `${userName} (${socket.id}) joined room ${roomId} | host: ${rooms[roomId].host}`
    );

    broadcastStats(roomId);
  });

  socket.on("offer", (targetId, offer) => {
    socket.to(targetId).emit("offer", socket.id, offer);
  });

  socket.on("answer", (targetId, answer) => {
    socket.to(targetId).emit("answer", socket.id, answer);
  });

  socket.on("ice-candidate", (targetId, candidate) => {
    socket.to(targetId).emit("ice-candidate", socket.id, candidate);
  });

  socket.on("screen-share-started", (rawRoomId) => {
    const roomId = sanitizeString(rawRoomId, 50);
    if (!roomId) return;
    socket.to(roomId).emit("user-screen-share-started", socket.id);
  });

  socket.on("screen-share-stopped", (rawRoomId) => {
    const roomId = sanitizeString(rawRoomId, 50);
    if (!roomId) return;
    socket.to(roomId).emit("user-screen-share-stopped", socket.id);
  });

  socket.on("chat-message", (rawRoomId, rawMessage) => {
    if (!checkSocketRateLimit(socket.id)) return;

    const roomId = sanitizeString(rawRoomId, 50);

    if (!roomId || !rawMessage) return;

    socket.to(roomId).emit("chat-message", socket.id, rawMessage);
  });

  socket.on("send-reaction", (rawRoomId, rawReaction, rawSenderName) => {
    if (!checkSocketRateLimit(socket.id)) return;

    const roomId = sanitizeString(rawRoomId, 50);
    const reaction = sanitizeString(rawReaction, 10);
    const senderName = sanitizeString(rawSenderName, 50);

    if (!roomId || !reaction) return;

    io.to(roomId).emit("receive-reaction", {
      id: Date.now() + Math.random(),
      reaction,
      senderName,
      socketId: socket.id,
    });
  });

  socket.on("speaking-state-change", (rawRoomId, isSpeaking) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;

    const user = rooms[roomId].users[socket.id];
    const now = Date.now();

    if (isSpeaking && !user.isSpeaking) {
      user.isSpeaking = true;
      user.lastStartedSpeakingAt = now;
    } else if (!isSpeaking && user.isSpeaking) {
      user.isSpeaking = false;

      if (user.lastStartedSpeakingAt) {
        user.totalSpeakingTime += now - user.lastStartedSpeakingAt;
        user.lastStartedSpeakingAt = null;
      }
    }
  });

  socket.on("host-remove-participant", (rawRoomId, targetSocketId) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
    if (!rooms[roomId].users[targetSocketId]) return;

    io.to(targetSocketId).emit("you-were-removed");

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.disconnect(true);
    }

    delete rooms[roomId].users[targetSocketId];

    io.to(roomId).emit("user-left", targetSocketId);
    io.to(roomId).emit("participants-update", getRoomParticipants(roomId));
  });

  socket.on("host-end-meeting", (rawRoomId) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;

    io.to(roomId).emit("meeting-ended-by-host");

    Object.keys(rooms[roomId].users).forEach((socketId) => {
      const participantSocket = io.sockets.sockets.get(socketId);
      if (participantSocket) {
        participantSocket.leave(roomId);
      }
    });

    delete rooms[roomId];

    console.log(`Host ended meeting in room ${roomId}`);
  });

  socket.on("host-lock-room", (rawRoomId) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;

    rooms[roomId].locked = true;
    io.to(roomId).emit("room-lock-status", true);
  });

  socket.on("host-unlock-room", (rawRoomId) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;

    rooms[roomId].locked = false;
    io.to(roomId).emit("room-lock-status", false);
  });

  socket.on("host-mute-participant", (rawRoomId, targetSocketId) => {
    const roomId = sanitizeString(rawRoomId, 50);

    if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
    if (!rooms[roomId].users[targetSocketId]) return;

    io.to(targetSocketId).emit("mute-requested");
  });

  socket.on("raise-hand", (rawRoomId, isRaised) => {
    if (!checkSocketRateLimit(socket.id)) return;

    const roomId = sanitizeString(rawRoomId, 50);

    if (!roomId || typeof isRaised !== "boolean") return;
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;

    rooms[roomId].users[socket.id].raisedHand = isRaised;

    io.to(roomId).emit("participants-update", getRoomParticipants(roomId));
    io.to(roomId).emit("raise-hand-update", {
      socketId: socket.id,
      raisedHand: isRaised,
    });
  });

  socket.on("disconnect", () => {
    delete socketRateLimits[socket.id];

    console.log(`User disconnected: ${socket.id}`);

    const roomId = socket.roomId;

    if (!roomId || !rooms[roomId]) return;

    const user = rooms[roomId].users[socket.id];

    if (user?.isSpeaking && user.lastStartedSpeakingAt) {
      user.totalSpeakingTime += Date.now() - user.lastStartedSpeakingAt;
    }

    delete rooms[roomId].users[socket.id];

    socket.to(roomId).emit("user-left", socket.id);
    socket.to(roomId).emit("participants-update", getRoomParticipants(roomId));

    if (rooms[roomId].host === socket.id) {
      const remainingUsers = Object.keys(rooms[roomId].users);

      if (remainingUsers.length > 0) {
        rooms[roomId].host = remainingUsers[0];

        io.to(remainingUsers[0]).emit("host-status", true);
        io.to(roomId).emit(
          "participants-update",
          getRoomParticipants(roomId)
        );

        console.log(`Host transferred to ${remainingUsers[0]} in room ${roomId}`);
      }
    }

    if (Object.keys(rooms[roomId].users).length === 0) {
      delete rooms[roomId];
    } else {
      broadcastStats(roomId);
    }
  });
});

setInterval(() => {
  for (const roomId in rooms) {
    broadcastStats(roomId);
  }
}, 1000);

function broadcastStats(roomId) {
  const roomUsers = rooms[roomId]?.users;
  if (!roomUsers) return;

  const stats = {};
  const now = Date.now();

  for (const socketId in roomUsers) {
    const user = roomUsers[socketId];

    let currentSpeakingTime = user.totalSpeakingTime;

    if (user.isSpeaking && user.lastStartedSpeakingAt) {
      currentSpeakingTime += now - user.lastStartedSpeakingAt;
    }

    stats[socketId] = {
      userName: user.userName,
      totalSpeakingTime: currentSpeakingTime,
      isSpeaking: user.isSpeaking,
    };
  }

  io.to(roomId).emit("speaking-stats", stats);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Backend signaling server running on port ${PORT}`);
});