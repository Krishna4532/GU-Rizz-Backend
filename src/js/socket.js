// ══════════════════════════════════════════════════════════
//  GU-Rizz Socket.io Client
//  Single shared instance used across all frontend modules.
// ══════════════════════════════════════════════════════════
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

/**
 * Connect socket with JWT from localStorage.
 * Call this immediately after a successful login.
 */
export function connectSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('gu_access_token');

  socket = io(SOCKET_URL, {
    auth:        { token },
    transports:  ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay:    1500,
    withCredentials: true,
  });

  socket.on('connect',            () => console.log('🔌 Socket connected:', socket.id));
  socket.on('disconnect',  (reason) => console.warn('🔌 Socket disconnected:', reason));
  socket.on('connect_error', (err) => console.error('🔌 Socket error:', err.message));

  return socket;
}

/** Disconnect and destroy the socket instance */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/** Access the socket instance (after connectSocket has been called) */
export function getSocket() {
  return socket;
}

// ── PRESENCE ──────────────────────────────────────────────
export function checkOnlineStatus(userIds, callback) {
  socket?.emit('presence:check', { userIds });
  socket?.once('presence:statuses', callback);
}

// ── CHAT ──────────────────────────────────────────────────
export function joinChat(chatId) {
  socket?.emit('chat:join', chatId);
}

export function leaveChat(chatId) {
  socket?.emit('chat:leave', chatId);
}

export function sendSocketMessage(chatId, text, tempId) {
  socket?.emit('chat:send', { chatId, text, tempId });
}

export function sendTyping(chatId) {
  socket?.emit('chat:typing', { chatId });
}

export function sendStopTyping(chatId) {
  socket?.emit('chat:stop_typing', { chatId });
}

export function markChatRead(chatId) {
  socket?.emit('chat:read', { chatId });
}

// ── VIDEO SPARK ────────────────────────────────────────────
export function joinSparkQueue() {
  socket?.emit('spark:join_queue');
}

export function leaveSparkQueue() {
  socket?.emit('spark:leave_queue');
}

export function sendSparkOffer(roomId, offer) {
  socket?.emit('spark:offer', { roomId, offer });
}

export function sendSparkAnswer(roomId, answer) {
  socket?.emit('spark:answer', { roomId, answer });
}

export function sendIceCandidate(roomId, candidate) {
  socket?.emit('spark:ice_candidate', { roomId, candidate });
}

export function nextSpark(roomId) {
  socket?.emit('spark:next', { roomId });
}

export function endSpark(roomId) {
  socket?.emit('spark:end', { roomId });
}

export function getOnlineCount() {
  socket?.emit('spark:get_online_count');
}

// ── POST ROOM (live like/comment counts) ──────────────────
export function watchPost(postId) {
  socket?.emit('post:watch', postId);
}
export function unwatchPost(postId) {
  socket?.emit('post:unwatch', postId);
}
