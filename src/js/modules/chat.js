import { S } from '../state.js';
import { initials, showToast } from '../helpers.js';
import { Chat as ChatAPI } from '../api.js';
import { joinChat, leaveChat, sendSocketMessage, sendTyping, sendStopTyping, markChatRead, getSocket } from '../socket.js';

let typingTimer = null;

// ── INBOX ─────────────────────────────────────────────────
export async function renderChatList() {
  const list = document.getElementById('chat-list-items');
  if (!list) return;
  try {
    const { data } = await ChatAPI.getInbox();
    S.chatInbox = data.chats || [];
  } catch {
    S.chatInbox = [];
  }
  if (!S.chatInbox.length) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px;">No messages yet.<br>Explore people and start a conversation! 💬</div>`;
    return;
  }
  list.innerHTML = S.chatInbox.map(c => {
    const other = c.other || {};
    return `
      <div class="chat-row ${S.activeChat === c._id ? 'active' : ''}" id="cr-${c._id}" onclick="window.openChat('${c._id}','${other._id}')">
        <div class="chat-av" style="background:${other.color||'#888'};position:relative;">
          ${other.profileImageURL ? `<img src="${other.profileImageURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : initials(other.name||'?')}
          <div class="online-dot" id="online-${other._id}" style="display:none;"></div>
        </div>
        <div class="chat-row-info">
          <div class="chat-row-name">${other.name || 'User'}</div>
          <div class="chat-row-preview">${c.lastMessage || 'Start a conversation'}</div>
        </div>
        <div class="chat-row-meta">
          <div class="chat-row-time">${timeAgoShort(c.updatedAt)}</div>
          ${c.unread > 0 ? `<div class="unread-badge">${c.unread}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Check presence for all contacts
  const socket = getSocket();
  if (socket) {
    const ids = S.chatInbox.map(c => c.other?._id).filter(Boolean);
    socket.emit('presence:check', { userIds: ids });
    socket.once('presence:statuses', (statuses) => {
      Object.entries(statuses).forEach(([uid, online]) => {
        const dot = document.getElementById('online-' + uid);
        if (dot) dot.style.display = online ? 'block' : 'none';
      });
    });
  }
}

export function filterChatList(q) {
  document.querySelectorAll('.chat-row').forEach(el => {
    const name = el.querySelector('.chat-row-name')?.textContent || '';
    el.style.display = name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

// ── OPEN CHAT ─────────────────────────────────────────────
export async function openChat(chatId, userId) {
  // If called with a userId but no chatId, create/get the chat first
  if (!chatId && userId) {
    try {
      const { data } = await ChatAPI.openWith(userId);
      chatId = data.chat._id;
    } catch (err) { showToast(err.message, 'error'); return; }
  }

  // Leave previous chat room
  if (S.activeChat && S.activeChat !== chatId) leaveChat(S.activeChat);

  S.activeChat = chatId;
  joinChat(chatId);
  markChatRead(chatId);

  // Update active state in list
  document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
  document.getElementById('cr-' + chatId)?.classList.add('active');

  // Find the other user info
  const chatEntry = S.chatInbox?.find(c => c._id === chatId);
  const other = chatEntry?.other || {};

  const win = document.getElementById('chat-window');
  if (!win) return;

  // Render skeleton header immediately
  win.innerHTML = `
    <div class="chat-win">
      <div class="chat-win-head">
        <div class="chat-win-av" style="background:${other.color||'#888'}">
          ${other.profileImageURL ? `<img src="${other.profileImageURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : initials(other.name||'?')}
        </div>
        <div>
          <div class="chat-win-name">${other.name || 'User'}</div>
          <div class="chat-win-status" id="chat-status-${chatId}">Loading...</div>
        </div>
        <div class="chat-win-actions">
          <div class="icon-btn" title="Voice note" onclick="window.showToast('Voice notes coming soon!','info')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
        </div>
      </div>
      <div class="chat-msgs" id="chat-msgs-${chatId}">
        <div style="text-align:center;padding:1rem;color:var(--text3);font-size:13px;">Loading messages...</div>
      </div>
      <div id="typing-indicator-${chatId}" style="padding:4px 14px;font-size:12px;color:var(--text3);display:none;">Typing...</div>
      <div class="chat-inp-bar">
        <label class="icon-btn" for="chat-media-${chatId}" title="Send image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </label>
        <input type="file" id="chat-media-${chatId}" accept="image/*,video/*,audio/*" style="display:none" onchange="window.sendChatMedia('${chatId}', this)" />
        <input class="chat-inp" id="ci-${chatId}" placeholder="Message ${other.name?.split(' ')[0] || 'User'}..."
          oninput="window.handleTyping('${chatId}')"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.sendMsg('${chatId}')}" />
        <button class="send-btn" onclick="window.sendMsg('${chatId}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>`;

  // Load messages from API
  try {
    const { data } = await ChatAPI.getMessages(chatId, 1);
    renderMessages(chatId, data.messages || [], other);
  } catch { /* show empty */ renderMessages(chatId, [], other); }

  bindChatSocketEvents(chatId, other);
}

function renderMessages(chatId, messages, other) {
  const msgsEl = document.getElementById('chat-msgs-' + chatId);
  if (!msgsEl) return;
  const me = S.user;

  msgsEl.innerHTML = messages.map(m => {
    const isMe  = String(m.senderId?._id || m.senderId) === String(me._id || me.id);
    const color = isMe ? (me.color || '#c0132a') : (other.color || '#888');
    const img   = isMe ? me.profileImageURL : other.profileImageURL;
    const avHtml = img
      ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : initials(isMe ? me.name : other.name || '?');

    let content = '';
    if (m.mediaURL) {
      if (m.mediaType === 'image') content = `<img src="${m.mediaURL}" style="max-width:220px;border-radius:10px;display:block;" />`;
      else if (m.mediaType === 'video') content = `<video src="${m.mediaURL}" controls style="max-width:220px;border-radius:10px;display:block;"></video>`;
      else if (m.mediaType === 'audio') content = `<audio src="${m.mediaURL}" controls style="max-width:220px;"></audio>`;
    } else {
      content = m.text || (m.isDeleted ? '<em style="opacity:0.5">Message deleted</em>' : '');
    }

    return `<div class="msg ${isMe ? 'sent' : 'received'}" id="msg-${m._id}">
      <div class="msg-av" style="background:${img ? 'transparent' : color}">${avHtml}</div>
      <div>
        <div class="msg-bub">${content}</div>
        <div style="font-size:10px;color:var(--text3);padding:2px 4px;${isMe ? 'text-align:right' : ''}">
          ${new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
          ${isMe ? (m.isRead ? ' ✓✓' : ' ✓') : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  msgsEl.scrollTop = msgsEl.scrollHeight;
  const statusEl = document.getElementById('chat-status-' + chatId);
  if (statusEl) statusEl.textContent = '● Online'; // simplified
}

function bindChatSocketEvents(chatId, other) {
  const socket = getSocket();
  if (!socket) return;

  // Remove previous listeners for this chat
  socket.off('chat:message');
  socket.off('chat:typing');
  socket.off('chat:stop_typing');
  socket.off('chat:read_receipt');
  socket.off('chat:message_deleted');

  socket.on('chat:message', (msg) => {
    if (String(msg.chatId) !== String(chatId)) return;
    appendMessage(chatId, msg, other);
    markChatRead(chatId);
  });

  socket.on('chat:typing', ({ userId, chatId: cid }) => {
    if (cid !== chatId || userId === String(S.user._id || S.user.id)) return;
    const el = document.getElementById('typing-indicator-' + chatId);
    if (el) el.style.display = 'block';
  });

  socket.on('chat:stop_typing', ({ chatId: cid }) => {
    if (cid !== chatId) return;
    const el = document.getElementById('typing-indicator-' + chatId);
    if (el) el.style.display = 'none';
  });

  socket.on('chat:read_receipt', ({ chatId: cid }) => {
    if (cid !== chatId) return;
    // Could update ✓✓ icons here
  });

  socket.on('chat:message_deleted', ({ msgId }) => {
    const el = document.getElementById('msg-' + msgId);
    if (el) { const bub = el.querySelector('.msg-bub'); if (bub) bub.innerHTML = '<em style="opacity:0.5">Message deleted</em>'; }
  });

  socket.on('presence:online',  ({ userId: uid }) => { const dot = document.getElementById('online-' + uid); if (dot) dot.style.display = 'block'; });
  socket.on('presence:offline', ({ userId: uid }) => { const dot = document.getElementById('online-' + uid); if (dot) dot.style.display = 'none'; });
}

function appendMessage(chatId, msg, other) {
  const msgsEl = document.getElementById('chat-msgs-' + chatId);
  if (!msgsEl) return;
  const me   = S.user;
  const isMe = String(msg.senderId?._id || msg.senderId) === String(me._id || me.id);
  const color = isMe ? (me.color || '#c0132a') : (other?.color || '#888');
  const img   = isMe ? me.profileImageURL : other?.profileImageURL;
  const avHtml = img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : initials(isMe ? me.name : other?.name || '?');
  const html = `<div class="msg ${isMe ? 'sent' : 'received'}" id="msg-${msg._id}">
    <div class="msg-av" style="background:${img ? 'transparent' : color}">${avHtml}</div>
    <div><div class="msg-bub">${msg.text || ''}</div></div>
  </div>`;
  msgsEl.insertAdjacentHTML('beforeend', html);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

// ── SEND MESSAGE ──────────────────────────────────────────
export function sendMsg(chatId) {
  const inp  = document.getElementById('ci-' + chatId);
  const text = inp?.value.trim();
  if (!text) return;
  const tempId = 'temp-' + Date.now();
  // Optimistic UI
  const other = S.chatInbox?.find(c => c._id === chatId)?.other || {};
  appendMessage(chatId, { _id: tempId, senderId: S.user._id || S.user.id, text, createdAt: new Date() }, other);
  if (inp) inp.value = '';
  // Send via Socket.io (primary) — REST is fallback
  sendSocketMessage(chatId, text, tempId);
}

export function handleTyping(chatId) {
  sendTyping(chatId);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => sendStopTyping(chatId), 2000);
}

export async function sendChatMedia(chatId, input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Sending...', 'info');
  try {
    await ChatAPI.sendMedia(chatId, file);
    showToast('Media sent!', 'success');
    input.value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

function timeAgoShort(dateStr) {
  if (!dateStr) return '';
  const d = Date.now() - new Date(dateStr).getTime();
  if (d < 60000) return 'now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h';
  return Math.floor(d / 86400000) + 'd';
}
