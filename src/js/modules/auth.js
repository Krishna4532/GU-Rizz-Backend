import { S } from '../state.js';
import { showToast, openModal } from '../helpers.js';
import { Auth } from '../api.js';
import { connectSocket, disconnectSocket } from '../socket.js';

export function authTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('login-form').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? '' : 'none';
}

export function forgotPassword() {
  const email = prompt('Enter your email to reset password:');
  if (!email) return;
  Auth.forgotPassword(email)
    .then(() => showToast('Reset link sent if that email exists 📧', 'info'))
    .catch(err => showToast(err.message, 'error'));
}

// ── LOGIN ─────────────────────────────────────────────────
export async function doLogin() {
  const identifier = document.getElementById('li-u').value.trim();
  const password   = document.getElementById('li-p').value;
  if (!identifier || !password) { showToast('Fill all fields', 'error'); return; }

  const loginBtn = document.querySelector('#login-form .btn-primary');
  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Logging in...'; }

  try {
    const { data } = await Auth.login(identifier, password);
    if (data.accessToken) Auth.storeToken(data.accessToken);
    bootUser(data.user, data.requiresVibeProfile);
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  } finally {
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Enter the Spark 🔥'; }
  }
}

// ── SIGNUP ────────────────────────────────────────────────
export async function doSignup() {
  const name        = document.getElementById('su-name').value.trim();
  const username    = document.getElementById('su-user').value.trim();
  const personalEmail = document.getElementById('su-email').value.trim();
  const age         = document.getElementById('su-age').value;
  const height      = document.getElementById('su-ht').value;
  const course      = document.getElementById('su-course').value;
  const year        = document.getElementById('su-year').value;
  const music       = document.getElementById('su-music').value;
  const nature      = document.getElementById('su-nature').value;
  const dob         = document.getElementById('su-dob').value;
  const password    = document.getElementById('su-pass').value;

  if (!name || !username || !age || !height || !course || !year || !music || !nature || !password) {
    showToast('Please fill all mandatory fields!', 'error'); return;
  }
  if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

  const signupBtn = document.querySelector('#signup-form .btn-primary');
  if (signupBtn) { signupBtn.disabled = true; signupBtn.textContent = 'Creating account...'; }

  try {
    const { data } = await Auth.signup({ name, username, personalEmail, password, dob });
    if (data.accessToken) Auth.storeToken(data.accessToken);

    // Complete vibe profile inline
    await Auth.completeVibeProfile({ age, height, course, year, music, nature, dob });

    bootUser(data.user, false);
    showToast(`Welcome to GU-Rizz, ${name.split(' ')[0]}! 🔥`, 'success');
  } catch (err) {
    showToast(err.message || 'Signup failed', 'error');
  } finally {
    if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = 'Create My Profile 🔥'; }
  }
}

// ── BOOT USER (after any successful auth) ─────────────────
export function bootUser(user, requiresVibeProfile = false) {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  S.user = { ...user };
  S.posts = [];

  // Connect socket with auth token
  connectSocket();

  // Bind global socket events (notifications, rizz, etc.)
  bindSocketEvents();

  if (window.initConfessions) window.initConfessions();
  S.following    = new Set(user.followingIds || []);
  S.giftsOwned   = user.giftsOwned || {};
  S.giftsReceived = user.giftsReceived || {};
  S.notifications = [];

  if (window.updateNavUI)      window.updateNavUI();
  if (window.renderAll)        window.renderAll();
  if (window.renderNotifBadge) window.renderNotifBadge();
  if (window.startTimeTracking) window.startTimeTracking();
  if (window.showToast) window.showToast('Welcome back, ' + user.name.split(' ')[0] + '! 🔥', 'success');

  // Load real notifications from backend
  loadNotifications();
}

// ── LOAD NOTIFICATIONS ────────────────────────────────────
async function loadNotifications() {
  try {
    const { data } = await (await import('../api.js')).Notifications.get();
    S.notifications = (data.notifications || []).map(n => ({
      id:     n._id,
      icon:   n.icon,
      bg:     n.bgColor,
      msg:    n.message,
      time:   timeAgoFromDate(n.createdAt),
      unread: !n.isRead,
    }));
    if (window.renderNotifBadge) window.renderNotifBadge();
    if (window.renderNotifList)  window.renderNotifList();
  } catch { /* non-fatal */ }
}

function timeAgoFromDate(dateStr) {
  const d = Date.now() - new Date(dateStr).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

// ── SOCKET EVENT BINDINGS ─────────────────────────────────
function bindSocketEvents() {
  const { getSocket } = require('../socket.js');
  const socket = getSocket();
  if (!socket) return;

  // Real-time notification
  socket.on('notification:new', (notif) => {
    S.notifications.unshift({
      id: notif._id, icon: notif.icon, bg: notif.bgColor,
      msg: notif.message, time: 'just now', unread: true,
    });
    if (window.renderNotifBadge) window.renderNotifBadge();
    if (window.renderNotifList)  window.renderNotifList();
  });

  // Real-time rizz update
  socket.on('rizz:update', ({ rizzPoints }) => {
    if (S.user) S.user.rizzPoints = rizzPoints;
    if (window.updateRizzDisplay) window.updateRizzDisplay();
  });

  // New post in feed from someone followed
  socket.on('feed:new_post', (post) => {
    S.posts.unshift({ ...post, liked: false });
    if (window.renderFeed) window.renderFeed();
  });
}

// ── LOGOUT ────────────────────────────────────────────────
export async function logout() {
  try {
    await Auth.logout();
  } catch { /* ignore */ }
  Auth.clearToken();
  disconnectSocket();
  S.user = null; S.posts = [];
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
