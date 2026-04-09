// ══════════════════════════════════════════════════════════
//  GU-Rizz API Client
//  Drop-in replacement for localStorage mock logic.
//  All functions match the shapes already used by modules.
// ══════════════════════════════════════════════════════════

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── HTTP HELPER ────────────────────────────────────────────
async function http(method, endpoint, body = null, isFormData = false) {
  const opts = {
    method,
    credentials: 'include',          // send cookies (httpOnly JWT)
    headers: {},
  };

  const token = localStorage.getItem('gu_access_token');
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;

  if (body) {
    if (isFormData) {
      opts.body = body;               // FormData — don't set Content-Type (browser sets boundary)
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const res  = await fetch(`${BASE}${endpoint}`, opts);
  const data = await res.json();

  // Auto-refresh token on 401
  if (res.status === 401 && endpoint !== '/auth/refresh-token') {
    const refreshed = await refreshToken();
    if (refreshed) return http(method, endpoint, body, isFormData);
  }

  if (!data.success) throw new Error(data.message || 'Request failed');
  return data;
}

const get    = (ep)          => http('GET',    ep);
const post   = (ep, b)       => http('POST',   ep, b);
const put    = (ep, b)       => http('PUT',    ep, b);
const patch  = (ep, b)       => http('PATCH',  ep, b);
const del    = (ep)          => http('DELETE', ep);
const upload = (ep, fd)      => http('POST',   ep, fd, true);

// ── TOKEN MANAGEMENT ──────────────────────────────────────
async function refreshToken() {
  try {
    const data = await http('POST', '/auth/refresh-token');
    if (data.data?.accessToken) {
      localStorage.setItem('gu_access_token', data.data.accessToken);
      return true;
    }
  } catch { /* refresh failed */ }
  return false;
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
export const Auth = {
  signup: (body) => post('/auth/signup', body),
  login:  (identifier, password) => post('/auth/login', { identifier, password }),
  logout: () => post('/auth/logout'),
  me:     () => get('/auth/me'),
  completeVibeProfile: (body) => post('/auth/complete-vibe', body),
  verifyEmail: (token) => get(`/auth/verify-email/${token}`),
  sendOtp:    (phoneNumber) => post('/auth/send-otp', { phoneNumber }),
  verifyOtp:  (otp) => post('/auth/verify-otp', { otp }),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => post(`/auth/reset-password/${token}`, { password }),
  resendVerification: () => post('/auth/resend-verify'),
  storeToken: (token) => localStorage.setItem('gu_access_token', token),
  clearToken: () => localStorage.removeItem('gu_access_token'),
};

// ══════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════
export const Users = {
  getProfile:   (username) => get(`/users/profile/${username}`),
  updateProfile:(body) => put('/users/profile', body),
  uploadAvatar: (file) => { const fd = new FormData(); fd.append('avatar', file); return upload('/users/avatar', fd); },
  follow:       (userId) => post(`/users/follow/${userId}`),
  getFollowers: (userId, page = 1) => get(`/users/${userId}/followers?page=${page}`),
  getFollowing: (userId, page = 1) => get(`/users/${userId}/following?page=${page}`),
  explore:      (params = {}) => get('/users/explore?' + new URLSearchParams(params).toString()),
  getSuggested: () => get('/users/suggested'),
  updateSettings:(body) => put('/users/settings', body),
  block:        (userId) => post(`/users/block/${userId}`),
  report:       (userId, reason) => post(`/users/report/${userId}`, { reason }),
  heartbeat:    (minutesSpent) => post('/users/heartbeat', { minutesSpent }),
};

// ══════════════════════════════════════════════════════════
//  POSTS
// ══════════════════════════════════════════════════════════
export const Posts = {
  getFeed:    (type = 'recent', page = 1) => get(`/posts?type=${type}&page=${page}`),
  getUserPosts:(userId, page = 1) => get(`/posts/user/${userId}?page=${page}`),
  getPost:    (postId) => get(`/posts/${postId}`),
  create:     (caption, mediaFile) => {
    const fd = new FormData();
    fd.append('caption', caption || '');
    if (mediaFile) fd.append('media', mediaFile);
    return upload('/posts', fd);
  },
  delete:     (postId) => del(`/posts/${postId}`),
  like:       (postId) => post(`/posts/${postId}/like`),
  comment:    (postId, text) => post(`/posts/${postId}/comment`, { text }),
  deleteComment: (postId, commentId) => del(`/posts/${postId}/comment/${commentId}`),
  share:      (postId) => post(`/posts/${postId}/share`),
  report:     (postId, reason) => post(`/posts/${postId}/report`, { reason }),
};

// ══════════════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════════════
export const Chat = {
  getInbox:    () => get('/chat/inbox'),
  openWith:    (userId) => get(`/chat/with/${userId}`),       // get or create DM
  getMessages: (chatId, page = 1) => get(`/chat/${chatId}/messages?page=${page}`),
  send:        (chatId, text) => post(`/chat/${chatId}/messages`, { text }),
  sendMedia:   (chatId, file) => {
    const fd = new FormData(); fd.append('media', file);
    return upload(`/chat/${chatId}/messages/media`, fd);
  },
  deleteMsg:   (msgId) => del(`/chat/messages/${msgId}`),
};

// ══════════════════════════════════════════════════════════
//  VIBE (Confessions, Gifts, Leaderboard)
// ══════════════════════════════════════════════════════════
export const Vibe = {
  // Confessions
  getConfessions:    (page = 1) => get(`/vibe/confessions?page=${page}`),
  createConfession:  (text) => post('/vibe/confessions', { text }),
  likeConfession:    (id) => post(`/vibe/confessions/${id}/like`),
  commentConfession: (id, text) => post(`/vibe/confessions/${id}/comment`, { text }),
  shareConfession:   (id) => post(`/vibe/confessions/${id}/share`),
  reportConfession:  (id, reason) => post(`/vibe/confessions/${id}/report`, { reason }),
  deleteConfession:  (id) => del(`/vibe/confessions/${id}`),

  // Gifts
  getGiftCatalog:    () => get('/vibe/gifts'),
  sendGift:          (recipientId, giftId, message = '') => post('/vibe/gifts/send', { recipientId, giftId, message }),
  getReceivedGifts:  (userId) => get(`/vibe/gifts/received/${userId}`),

  // Leaderboard
  getLeaderboard: (period = 'alltime') => get(`/vibe/leaderboard?period=${period}`),
};

// ══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════
export const Notifications = {
  get:      (page = 1) => get(`/notifications?page=${page}`),
  markRead: (ids = null) => post('/notifications/read', ids ? { ids } : {}),
};
