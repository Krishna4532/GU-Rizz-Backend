const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { Chat, Message } = require('../models/Chat');
const { createNotification } = require('../services/notificationService');

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

// Video spark queue: waiting users { userId, socketId, roomId }
const sparkQueue = [];

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── JWT AUTH MIDDLEWARE ────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('name username profileImageURL color isSuspended');
      if (!user || user.isSuspended) return next(new Error('Unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    console.log(`🔌 Socket connected: ${socket.user.username} (${socket.id})`);

    // ── PRESENCE ──────────────────────────────────────────
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Join personal room for targeted notifications / rizz updates
    socket.join(`user:${userId}`);

    // Broadcast online status to followers
    socket.broadcast.emit('presence:online', { userId });

    // ── DISCONNECT ────────────────────────────────────────
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('presence:offline', { userId });
          User.findByIdAndUpdate(userId, { lastActiveDate: new Date() }).catch(() => {});
        }
      }
      // Remove from spark queue if waiting
      const idx = sparkQueue.findIndex(u => u.userId === userId);
      if (idx !== -1) sparkQueue.splice(idx, 1);
      console.log(`🔌 Disconnected: ${socket.user.username}`);
    });

    // ── CHAT ROOM JOIN ────────────────────────────────────
    socket.on('chat:join', (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('chat:leave', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // ── REAL-TIME MESSAGE ─────────────────────────────────
    socket.on('chat:send', async (data) => {
      try {
        const { chatId, text, tempId } = data;
        if (!chatId || !text?.trim()) return;

        // Verify participant
        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) return socket.emit('chat:error', { message: 'Not a participant' });

        const msg = await Message.create({
          chatId, senderId: userId, text: text.trim(),
        });
        const populated = await msg.populate('senderId', 'name username profileImageURL color');

        // Update chat last message
        const otherId = chat.participants.find(p => String(p) !== userId);
        await Chat.findByIdAndUpdate(chatId, {
          lastMessage:  text.trim().slice(0, 80),
          lastSenderId: userId,
          updatedAt:    new Date(),
          $inc: { [`unreadCounts.${otherId}`]: 1 },
        });

        // Deliver to everyone in the chat room
        io.to(`chat:${chatId}`).emit('chat:message', {
          ...populated.toObject(),
          tempId,          // echo back so sender can replace optimistic bubble
        });

        // Notify recipient if offline
        if (!onlineUsers.has(String(otherId))) {
          await createNotification({
            recipientId: otherId, actorId: userId,
            kind: 'MESSAGE',
            message: `<strong>${socket.user.name}</strong>: ${text.slice(0, 50)}`,
            chatId, io,
          });
        }
      } catch (err) {
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // ── TYPING INDICATORS ─────────────────────────────────
    socket.on('chat:typing', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('chat:typing', {
        userId, name: socket.user.name, chatId,
      });
    });

    socket.on('chat:stop_typing', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('chat:stop_typing', { userId, chatId });
    });

    // ── MESSAGE READ RECEIPT ───────────────────────────────
    socket.on('chat:read', async ({ chatId }) => {
      await Message.updateMany(
        { chatId, senderId: { $ne: userId }, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      ).catch(() => {});
      await Chat.findByIdAndUpdate(chatId, {
        $set: { [`unreadCounts.${userId}`]: 0 }
      }).catch(() => {});
      socket.to(`chat:${chatId}`).emit('chat:read_receipt', { chatId, readBy: userId });
    });

    // ════════════════════════════════════════════════════════
    // VIDEO SPARK — WebRTC Signaling
    // ════════════════════════════════════════════════════════

    // User joins the random spark queue
    socket.on('spark:join_queue', () => {
      // Remove any existing entry
      const existing = sparkQueue.findIndex(u => u.userId === userId);
      if (existing !== -1) sparkQueue.splice(existing, 1);

      // Try to match with someone already waiting
      if (sparkQueue.length > 0) {
        const partner = sparkQueue.shift();

        // Create a unique room ID
        const roomId = `spark:${Date.now()}:${Math.random().toString(36).slice(2)}`;

        // Tell both users to join the room and who initiates the offer
        socket.emit('spark:matched', {
          roomId,
          partnerId: partner.userId,
          partnerInfo: { name: partner.name, username: partner.username, color: partner.color },
          isInitiator: true,   // this socket makes the offer
        });

        io.to(partner.socketId).emit('spark:matched', {
          roomId,
          partnerId: userId,
          partnerInfo: { name: socket.user.name, username: socket.user.username, color: socket.user.color },
          isInitiator: false,  // waiter answers
        });

        socket.join(roomId);
        io.sockets.sockets.get(partner.socketId)?.join(roomId);

        console.log(`⚡ Spark matched: ${socket.user.username} <-> ${partner.username} [${roomId}]`);
      } else {
        // Add to queue
        sparkQueue.push({
          userId, socketId: socket.id,
          name:     socket.user.name,
          username: socket.user.username,
          color:    socket.user.color,
        });
        socket.emit('spark:waiting', { queueLength: sparkQueue.length });
      }
    });

    // Leave queue without matching
    socket.on('spark:leave_queue', () => {
      const idx = sparkQueue.findIndex(u => u.userId === userId);
      if (idx !== -1) sparkQueue.splice(idx, 1);
    });

    // ── WebRTC OFFER ────────────────────────────────────────
    socket.on('spark:offer', ({ roomId, offer }) => {
      socket.to(roomId).emit('spark:offer', { offer, from: userId });
    });

    // ── WebRTC ANSWER ───────────────────────────────────────
    socket.on('spark:answer', ({ roomId, answer }) => {
      socket.to(roomId).emit('spark:answer', { answer, from: userId });
    });

    // ── ICE CANDIDATES ──────────────────────────────────────
    socket.on('spark:ice_candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('spark:ice_candidate', { candidate, from: userId });
    });

    // ── NEXT STRANGER ────────────────────────────────────────
    socket.on('spark:next', ({ roomId }) => {
      // Notify partner that this user skipped
      socket.to(roomId).emit('spark:partner_left', { userId });
      socket.leave(roomId);
      // Re-enter queue automatically
      socket.emit('spark:left_room');
    });

    // ── END SPARK CALL ───────────────────────────────────────
    socket.on('spark:end', ({ roomId }) => {
      socket.to(roomId).emit('spark:ended', { by: userId });
      socket.leave(roomId);
      io.in(roomId).socketsLeave(roomId);
    });

    // ── LIVE COUNT ───────────────────────────────────────────
    socket.on('spark:get_online_count', () => {
      socket.emit('spark:online_count', { count: onlineUsers.size });
    });

    // ── ONLINE STATUS CHECK ──────────────────────────────────
    socket.on('presence:check', ({ userIds }) => {
      const statuses = {};
      userIds.forEach(id => { statuses[id] = onlineUsers.has(String(id)); });
      socket.emit('presence:statuses', statuses);
    });

    // ── POST ROOM (for real-time like/comment counts) ─────────
    socket.on('post:watch', (postId) => socket.join(`post:${postId}`));
    socket.on('post:unwatch', (postId) => socket.leave(`post:${postId}`));
  });

  return io;
};

// Helper: get online user count (for REST endpoint)
const getOnlineCount = () => onlineUsers.size;

module.exports = { initSocket, getOnlineCount };
