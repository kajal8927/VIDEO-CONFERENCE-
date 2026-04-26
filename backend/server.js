const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store room data: roomId -> { socketId: { userName, totalSpeakingTime, isSpeaking, lastStartedSpeakingAt } }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId, userName) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {};
    }

    rooms[roomId][socket.id] = {
      socketId: socket.id,
      userName: userName,
      totalSpeakingTime: 0,
      isSpeaking: false,
      lastStartedSpeakingAt: null
    };

    socket.roomId = roomId;

    // Send the list of existing users to the new user so they can initiate offers
    const existingUsers = Object.keys(rooms[roomId]).filter(id => id !== socket.id);
    socket.emit('room-users', existingUsers);

    // Notify others
    socket.to(roomId).emit('user-joined', socket.id, userName);
    console.log(`${userName} (${socket.id}) joined room ${roomId}`);
    
    // Broadcast initial stats
    broadcastStats(roomId);
  });

  // WebRTC Signaling
  socket.on('offer', (targetId, offer) => {
    socket.to(targetId).emit('offer', socket.id, offer);
  });

  socket.on('answer', (targetId, answer) => {
    socket.to(targetId).emit('answer', socket.id, answer);
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    socket.to(targetId).emit('ice-candidate', socket.id, candidate);
  });

  // Chat
  socket.on('chat-message', (roomId, message) => {
    socket.to(roomId).emit('chat-message', socket.id, message);
  });

  // Analytics: Speaking state
  socket.on('speaking-state-change', (roomId, isSpeaking) => {
    if (!rooms[roomId] || !rooms[roomId][socket.id]) return;

    const user = rooms[roomId][socket.id];
    const now = Date.now();

    if (isSpeaking && !user.isSpeaking) {
      user.isSpeaking = true;
      user.lastStartedSpeakingAt = now;
    } else if (!isSpeaking && user.isSpeaking) {
      user.isSpeaking = false;
      if (user.lastStartedSpeakingAt) {
        user.totalSpeakingTime += (now - user.lastStartedSpeakingAt);
        user.lastStartedSpeakingAt = null;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      // Calculate final speaking time if they were speaking
      const user = rooms[roomId][socket.id];
      if (user && user.isSpeaking && user.lastStartedSpeakingAt) {
        user.totalSpeakingTime += (Date.now() - user.lastStartedSpeakingAt);
      }

      delete rooms[roomId][socket.id];
      socket.to(roomId).emit('user-left', socket.id);

      if (Object.keys(rooms[roomId]).length === 0) {
        delete rooms[roomId];
      } else {
        broadcastStats(roomId);
      }
    }
  });
});

// Periodically broadcast speaking stats to all active rooms
setInterval(() => {
  for (const roomId in rooms) {
    broadcastStats(roomId);
  }
}, 1000); // Update every second

function broadcastStats(roomId) {
  const roomUsers = rooms[roomId];
  if (!roomUsers) return;

  const stats = {};
  const now = Date.now();

  for (const socketId in roomUsers) {
    const user = roomUsers[socketId];
    let currentSpeakingTime = user.totalSpeakingTime;
    
    // Add time spoken in the current ongoing burst
    if (user.isSpeaking && user.lastStartedSpeakingAt) {
      currentSpeakingTime += (now - user.lastStartedSpeakingAt);
    }
    
    stats[socketId] = {
      userName: user.userName,
      totalSpeakingTime: currentSpeakingTime,
      isSpeaking: user.isSpeaking
    };
  }

  io.to(roomId).emit('speaking-stats', stats);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Backend signaling server running on port ${PORT}`);
});
