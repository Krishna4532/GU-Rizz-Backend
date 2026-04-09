import { S } from '../state.js';
import { Notifications } from '../api.js';

// Local add (for optimistic UI before server confirms)
export function addNotification(icon, bg, msg, time) {
  if (!S.notifications) S.notifications = [];
  S.notifications.unshift({ id: Date.now(), icon, bg, msg, time, unread: true });
  renderNotifBadge();
  renderNotifList();
}

export function renderNotifBadge() {
  const count = (S.notifications || []).filter(n => n.unread).length;
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.remove('notif-hidden'); }
  else { badge.classList.add('notif-hidden'); }
}

export function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!(S.notifications || []).length) {
    list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text3);font-size:14px;">No notifications yet 🔔</div>';
    return;
  }
  list.innerHTML = (S.notifications || []).map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="window.markNotifRead(${n.id})">
      <div class="notif-icon" style="background:${n.bg || 'rgba(192,19,42,0.15)'}">${n.icon || '🔔'}</div>
      <div class="notif-text">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>
      ${n.unread ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`).join('');
}

export async function markNotifRead(id) {
  const n = (S.notifications || []).find(x => x.id === id || x.id === String(id));
  if (n) n.unread = false;
  renderNotifBadge();
  renderNotifList();
  // Sync to server
  try { await Notifications.markRead([String(id)]); } catch { /* non-fatal */ }
}

export async function clearNotifs() {
  (S.notifications || []).forEach(n => n.unread = false);
  renderNotifBadge();
  renderNotifList();
  try { await Notifications.markRead(); } catch { /* non-fatal */ }
}

export function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderNotifList();
}
