import { S } from '../state.js';
import { initials, showToast } from '../helpers.js';
import { Vibe } from '../api.js';
import { addRizz, updateRizzDisplay } from './rizz.js';
import { addNotification } from './notifications.js';

// ── VIBE TAB SWITCHER ─────────────────────────────────────
export function vibeTab(tab, btn) {
  document.querySelectorAll('.vtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.vcontent').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vc-' + tab).classList.add('active');
  if (tab === 'leaderboard') renderLeaderboard();
  if (tab === 'gifts')       renderGifts();
  if (tab === 'confess')     renderConfessions();
}

// ═══════════════════════════════════════════════════════════
//  CONFESSIONS
// ═══════════════════════════════════════════════════════════

export function initConfessions() {
  if (!S.confessions?.length) renderConfessions();
}

export async function renderConfessions() {
  const list = document.getElementById('confessions-list');
  if (!list) return;
  list.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text3);font-size:13px;">Loading confessions...</div>`;
  try {
    const { data } = await Vibe.getConfessions(1);
    S.confessions = data.confessions || [];
  } catch { S.confessions = []; }
  _renderConfessionList();
}

function _renderConfessionList() {
  const list = document.getElementById('confessions-list');
  if (!list) return;
  if (!S.confessions.length) {
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text3);">No confessions yet. Be the first 🤫</div>`;
    return;
  }
  list.innerHTML = S.confessions.map((c, i) => `
    <div class="conf-card">
      <div class="conf-num">#${i + 1}</div>
      <div class="conf-text">"${c.text}"</div>
      <div style="margin-bottom:8px;">
        ${(c.comments || []).map(cm => `
          <div class="comment-item" style="margin-bottom:4px;">
            <div class="comment-av" style="background:var(--bg5);font-size:11px;">👤</div>
            <div class="comment-bubble"><span class="comment-who" style="color:var(--text3);">Anon</span>${cm.text}</div>
          </div>`).join('')}
      </div>
      <div class="conf-actions">
        <button class="conf-action ${c.liked ? 'liked' : ''}" onclick="window.likeConf('${c._id}')">
          <svg viewBox="0 0 24 24" fill="${c.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          ${c.likesCount || 0}
        </button>
        <button class="conf-action" onclick="window.commentConf('${c._id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          ${c.commentsCount || c.comments?.length || 0} Comments
        </button>
        <button class="conf-action" onclick="window.shareConf('${c._id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
    </div>`).join('');
}

export async function postConfession() {
  const text = document.getElementById('conf-textarea')?.value.trim();
  if (!text) { showToast('Write something first!', 'error'); return; }
  try {
    const { data } = await Vibe.createConfession(text);
    S.confessions.unshift(data.confession);
    document.getElementById('conf-textarea').value = '';
    _renderConfessionList();
    showToast('Confession posted anonymously 🤫', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

export async function likeConf(id) {
  try {
    const { data } = await Vibe.likeConfession(id);
    const c = S.confessions.find(x => x._id === id);
    if (c) { c.liked = data.liked; c.likesCount = data.likesCount; }
    if (data.liked) { addRizz(2); showToast('❤️ +2 Rizz!', 'info'); }
    _renderConfessionList();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function commentConf(id) {
  const text = prompt('Add anonymous comment (identity hidden):');
  if (!text?.trim()) return;
  try {
    const { data } = await Vibe.commentConfession(id, text.trim());
    const c = S.confessions.find(x => x._id === id);
    if (c) { if (!c.comments) c.comments = []; c.comments.push(data.comment); c.commentsCount = c.comments.length; }
    addRizz(5); showToast('💬 +5 Rizz!', 'info');
    _renderConfessionList();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function shareConf(id) {
  try {
    await Vibe.shareConfession(id);
    addRizz(10); showToast('🔁 Confession shared! +10 Rizz!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  LEADERBOARD
// ═══════════════════════════════════════════════════════════

export async function renderLeaderboard(period = 'alltime') {
  try {
    const { data } = await Vibe.getLeaderboard(period);
    const board = data.leaderboard || [];
    const myRank = data.myRank;
    const maxPts = board[0]?.rizzPoints || 1;

    // Top 3 podium
    const top3  = board.slice(0, 3);
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const podiumCls = ['second', 'first', 'third'];
    const medals    = ['🥈', '🥇', '🥉'];
    const ringCls   = ['silver', 'gold', 'bronze'];

    const top3El = document.getElementById('lb-top3');
    if (top3El) {
      top3El.innerHTML = order.map((u, i) => {
        const img = u.profileImageURL;
        const avHtml = img
          ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : initials(u.name);
        return `
          <div class="lb-podium">
            <div class="${i === 1 ? 'lb-crown' : 'lb-medal'}">${i === 1 ? '👑' : medals[i]}</div>
            <div class="lb-podium-av ${ringCls[i]}" style="background:${u.color||'#888'}">${avHtml}</div>
            <div class="lb-podium-name">${u.name.split(' ')[0]} ${u.isMe ? '(You)' : ''}</div>
            <div class="lb-podium-pts">⚡ ${(u.rizzPoints||0).toLocaleString()}</div>
            <div class="lb-podium-base ${podiumCls[i]}">${medals[i]}</div>
          </div>`;
      }).join('');
    }

    const listEl = document.getElementById('lb-list');
    if (listEl) {
      listEl.innerHTML = board.map((u, i) => {
        const img = u.profileImageURL;
        const avHtml = img
          ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : initials(u.name);
        return `
          <div class="lb-row ${u.isMe ? 'me' : ''}">
            <div class="lb-rank">#${i + 1}</div>
            <div class="lb-row-av" style="background:${u.color||'#888'}">${avHtml}</div>
            <div class="lb-row-info">
              <div class="lb-row-name">${u.name} ${u.isMe ? '<span style="font-size:11px;color:var(--cr2);">(You)</span>' : ''}</div>
              <div class="lb-row-sub">${u.course || ''} ${u.year ? '· ' + u.year : ''}</div>
              <div class="lb-row-bar"><div class="lb-row-bar-fill" style="width:${Math.round(((u.rizzPoints||0)/maxPts)*100)}%"></div></div>
            </div>
            <div class="lb-pts">${(u.rizzPoints||0).toLocaleString()} <span>pts</span></div>
          </div>`;
      }).join('');
    }

    // Show user's rank if not in top 50
    if (myRank > 50) {
      const note = document.getElementById('lb-list');
      if (note) note.insertAdjacentHTML('beforeend', `
        <div class="lb-row me" style="border-top:2px solid var(--cr);">
          <div class="lb-rank">#${myRank}</div>
          <div class="lb-row-av" style="background:${S.user?.color||'#c0132a'}">${initials(S.user?.name||'Me')}</div>
          <div class="lb-row-info"><div class="lb-row-name">You</div></div>
          <div class="lb-pts">${(S.user?.rizzPoints||0).toLocaleString()} <span>pts</span></div>
        </div>`);
    }
  } catch { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════
//  GIFTS
// ═══════════════════════════════════════════════════════════

export async function renderGifts() {
  const el = document.getElementById('gifts-grid');
  if (!el) return;
  try {
    const { data } = await Vibe.getGiftCatalog();
    const gifts   = data.gifts || [];
    const myRizz  = data.myRizzPoints || S.user?.rizzPoints || 0;

    // Update my rizz display
    const valEl = document.getElementById('gifts-rizz-val');
    if (valEl) valEl.textContent = myRizz;

    el.innerHTML = gifts.map(g => `
      <div class="gift-card ${g.canAfford ? '' : 'cant-afford'}">
        <div class="gift-emoji">${g.emoji}</div>
        <div class="gift-name">${g.name}</div>
        <div class="gift-cost">⚡ ${g.cost} pts</div>
        <div class="gift-desc" style="font-size:11px;color:var(--text3);margin-bottom:10px;">${g.description || ''}</div>
        <button class="buy-btn" ${!g.canAfford ? 'disabled' : ''} onclick="window.openGiftModal('${g.id}','${g.emoji}','${g.name}',${g.cost})">
          ${g.canAfford ? 'Send Gift 💝' : `Need ${g.cost - myRizz} more pts`}
        </button>
      </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:2rem;">Unable to load gifts</div>'; }
}

export function openGiftModal(giftId, emoji, name, cost) {
  S.pendingGift = { id: giftId, emoji, name, cost };
  document.getElementById('gift-modal-title').textContent = `Send ${emoji} ${name}`;

  // Populate recipient list from suggested users / following
  const sel = document.getElementById('gift-recipient');
  sel.innerHTML = '';

  (S.suggestedUsers || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u._id;
    opt.textContent = `${u.name} (@${u.username})`;
    sel.appendChild(opt);
  });

  if (window.openModal) window.openModal('gift-modal');
}

export async function confirmGift() {
  const gift      = S.pendingGift;
  const recipId   = document.getElementById('gift-recipient')?.value;
  if (!gift || !recipId) { if (window.closeModal) window.closeModal('gift-modal'); return; }

  try {
    const { data, message } = await Vibe.sendGift(recipId, gift.id);
    if (S.user) S.user.rizzPoints = data.newRizzPoints;
    updateRizzDisplay();
    if (window.closeModal) window.closeModal('gift-modal');
    renderGifts();
    addNotification('🎁', 'rgba(192,19,42,0.15)', message || 'Gift sent!', 'Just now');
    showToast(message || `${gift.emoji} sent! 💝`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
