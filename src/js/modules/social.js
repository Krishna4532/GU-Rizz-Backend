import { S } from '../state.js';
import { initials, timeAgo, showToast } from '../helpers.js';
import { Posts, Users } from '../api.js';
import { addRizz } from './rizz.js';
import { addNotification } from './notifications.js';

// ── STORIES ───────────────────────────────────────────────
export function renderStories() {
  const row = document.getElementById('stories-row');
  if (!row) return;
  const u = S.user;
  let html = `
    <div class="story-item" onclick="window.openPostModal('story')">
      <div class="story-ring">
        <div class="story-inner" style="background:${u.color || '#c0132a'};font-size:22px;">
          ${u.profileImageURL ? `<img src="${u.profileImageURL}" />` : '+'}
        </div>
      </div>
      <div class="story-name">Your Story</div>
    </div>`;

  // Use suggested users for stories
  (S.suggestedUsers || []).slice(0, 8).forEach(usr => {
    html += `
      <div class="story-item" onclick="window.openStory('${usr._id}', '${usr.name}', '${usr.color || '#888'}', '${usr.profileImageURL || ''}')">
        <div class="story-ring">
          <div class="story-inner" style="background:${usr.color || '#888'};">
            ${usr.profileImageURL ? `<img src="${usr.profileImageURL}" />` : initials(usr.name)}
          </div>
        </div>
        <div class="story-name">${usr.name.split(' ')[0]}</div>
      </div>`;
  });
  row.innerHTML = html;
}

const STORY_EMOJIS = ['🌅', '📚', '🎵', '🏃', '😂', '🍕', '☕', '🎮', '🤩', '💡'];
export function openStory(uid, name, color, imgUrl) {
  const viewer  = document.getElementById('story-viewer');
  const content = document.getElementById('story-viewer-content');
  const head    = document.getElementById('story-viewer-head');
  const progBar = document.getElementById('story-prog-bar');
  if (!viewer) return;
  viewer.classList.add('open');
  progBar.innerHTML = '<div class="story-prog done"></div><div class="story-prog active-bar"></div><div class="story-prog"></div>';
  const avatarHtml = imgUrl
    ? `<img src="${imgUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:12px;">${initials(name)}</div>`;
  head.innerHTML = `${avatarHtml}<span style="font-size:14px;font-weight:600;">${name}</span><span style="font-size:12px;color:rgba(255,255,255,0.5);">1h ago</span>`;
  content.innerHTML = `<div class="story-content-emoji">${STORY_EMOJIS[Math.floor(Math.random() * STORY_EMOJIS.length)]}</div>`;
  viewer._timer = setTimeout(() => closeStory(), 5000);
}

export function closeStory() {
  const v = document.getElementById('story-viewer');
  if (v) { v.classList.remove('open'); clearTimeout(v._timer); }
}

// ── FEED ──────────────────────────────────────────────────
export async function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // Show skeleton while loading if feed is empty
  if (!S.posts.length) {
    container.innerHTML = `<div style="text-align:center;padding:2rem;"><div style="font-size:13px;color:var(--text3);">Loading feed...</div></div>`;
    try {
      const { data } = await Posts.getFeed('recent', 1);
      S.posts = data.posts || [];
      S.feedHasMore = data.hasMore;
    } catch {
      S.posts = [];
    }
  }

  if (!S.posts.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 2rem;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);">
        <div style="font-size:48px;margin-bottom:1rem;">📸</div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:18px;margin-bottom:0.5rem;">Your feed is empty</div>
        <div style="color:var(--text2);font-size:14px;margin-bottom:1.5rem;">Be the first to post something! Follow others to see their posts.</div>
        <button class="btn-primary" style="width:auto;padding:12px 28px;" onclick="window.openPostModal('photo')">Create First Post 📸</button>
      </div>`;
    return;
  }
  container.innerHTML = S.posts.map((p, i) => buildPostHTML(p, i * 0.04)).join('');
}

function buildPostHTML(p, delay = 0) {
  const me     = S.user;
  const poster = p.userId; // populated object from API
  const name   = poster?.name || me.name;
  const handle = poster?.username || me.username;
  const color  = poster?.color || '#c0132a';
  const imgUrl = poster?.profileImageURL || null;

  const avHTML = imgUrl
    ? `<div class="post-av"><img src="${imgUrl}" /></div>`
    : `<div class="post-av" style="background:${color}">${initials(name)}</div>`;

  let mediaHTML = '';
  if (p.mediaURL && !p.isVideo) {
    mediaHTML = `<div class="post-media"><img src="${p.mediaURL}" alt="post" loading="lazy" /></div>`;
  } else if (p.mediaURL && p.isVideo) {
    mediaHTML = `<div class="post-media"><video src="${p.mediaURL}" controls preload="none"></video><div class="post-media-badge">🎬 Video</div></div>`;
  } else if (p.emoji) {
    mediaHTML = `<div class="post-media"><div class="post-media-img">${p.emoji}</div></div>`;
  }

  const cmtHTML = (p.comments || []).slice(-3).map(c => {
    const cPoster = c.userId;
    const cColor  = cPoster?.color || '#888';
    const cImg    = cPoster?.profileImageURL;
    const cAv     = cImg ? `<img src="${cImg}" />` : initials(cPoster?.name || '?');
    return `<div class="comment-item">
      <div class="comment-av" style="background:${cImg ? 'transparent' : cColor}">${cAv}</div>
      <div class="comment-bubble"><span class="comment-who">${cPoster?.username || 'user'}</span>${c.text}</div>
    </div>`;
  }).join('');

  const postId = p._id || p.id;

  return `
    <div class="post-card" id="post-${postId}" style="animation-delay:${delay}s">
      <div class="post-head">
        ${avHTML}
        <div class="post-meta">
          <div class="post-name">${name}</div>
          <div class="post-info">@${handle} · ${timeAgo(new Date(p.createdAt).getTime())}</div>
        </div>
        ${String(poster?._id) === String(me._id || me.id) ? `
          <button onclick="window.deletePost('${postId}')" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:4px 8px;font-size:18px;" title="Delete">🗑</button>
        ` : ''}
      </div>
      ${mediaHTML}
      ${p.caption ? `<div class="post-caption"><strong>@${handle}</strong> ${p.caption}</div>` : ''}
      <div class="post-stats" id="pstats-${postId}">${p.likesCount || 0} likes · ${(p.comments || []).length} comments · ${p.sharesCount || 0} shares</div>
      <div class="post-actions">
        <button class="post-action ${p.liked ? 'liked' : ''}" id="like-btn-${postId}" onclick="window.likePost('${postId}')">
          <svg id="heart-${postId}" viewBox="0 0 24 24" fill="${p.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Like
        </button>
        <button class="post-action" onclick="window.toggleComments('${postId}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Comment
        </button>
        <button class="post-action" onclick="window.sharePost('${postId}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
      <div class="comments-section" id="cmts-${postId}">
        <div class="comment-list" id="clist-${postId}">${cmtHTML}</div>
        <div class="comment-inp-row">
          <input class="comment-inp" placeholder="Add a comment..." id="cinp-${postId}" onkeydown="if(event.key==='Enter') window.addComment('${postId}')" />
          <button class="comment-send" onclick="window.addComment('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

// ── POST ACTIONS ─────────────────────────────────────────
export async function likePost(id) {
  try {
    const p = S.posts.find(x => (x._id || x.id) === id);
    if (!p) return;
    const { data } = await Posts.like(id);
    p.liked = data.liked;
    p.likesCount = data.likesCount;
    const btn   = document.getElementById('like-btn-' + id);
    const stats = document.getElementById('pstats-' + id);
    if (btn) {
      btn.className = 'post-action ' + (p.liked ? 'liked' : '');
      btn.querySelector('svg').setAttribute('fill', p.liked ? 'currentColor' : 'none');
    }
    if (stats) stats.textContent = `${p.likesCount} likes · ${(p.comments||[]).length} comments · ${p.sharesCount||0} shares`;
    if (p.liked) { addRizz(2); showToast('❤️ +2 Rizz Points!', 'info'); }
    if (window.renderLeaderboard) window.renderLeaderboard();
  } catch (err) { showToast(err.message, 'error'); }
}

export function toggleComments(id) {
  const el = document.getElementById('cmts-' + id);
  if (el) el.classList.toggle('open');
}

export async function addComment(id) {
  const inp  = document.getElementById('cinp-' + id);
  const text = inp?.value.trim();
  if (!text) return;
  try {
    const { data } = await Posts.comment(id, text);
    const p = S.posts.find(x => (x._id || x.id) === id);
    if (p) { if (!p.comments) p.comments = []; p.comments.push(data.comment); }
    addRizz(5); showToast('💬 +5 Rizz Points!', 'info');
    if (inp) inp.value = '';
    // Append comment to DOM without full re-render
    const list  = document.getElementById('clist-' + id);
    const stats = document.getElementById('pstats-' + id);
    if (list) {
      const c = data.comment;
      const u = S.user;
      list.insertAdjacentHTML('beforeend', `
        <div class="comment-item">
          <div class="comment-av" style="background:${u.profileImageURL ? 'transparent' : (u.color||'#c0132a')}">
            ${u.profileImageURL ? `<img src="${u.profileImageURL}" />` : initials(u.name)}
          </div>
          <div class="comment-bubble"><span class="comment-who">@${u.username}</span>${c.text}</div>
        </div>`);
    }
    if (stats && p) stats.textContent = `${p.likesCount||0} likes · ${p.comments.length} comments · ${p.sharesCount||0} shares`;
    if (window.renderLeaderboard) window.renderLeaderboard();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function sharePost(id) {
  try {
    await Posts.share(id);
    const p = S.posts.find(x => (x._id || x.id) === id);
    if (p) p.sharesCount = (p.sharesCount || 0) + 1;
    addRizz(10); showToast('🔁 +10 Rizz Points!', 'success');
    const stats = document.getElementById('pstats-' + id);
    if (stats && p) stats.textContent = `${p.likesCount||0} likes · ${(p.comments||[]).length} comments · ${p.sharesCount} shares`;
    if (window.renderLeaderboard) window.renderLeaderboard();
  } catch (err) { showToast(err.message, 'error'); }
}

export async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  try {
    await Posts.delete(id);
    S.posts = S.posts.filter(p => (p._id || p.id) !== id);
    renderFeed();
    if (window.renderMiniProfile) window.renderMiniProfile();
    if (window.renderProfilePosts) window.renderProfilePosts();
    showToast('Post deleted', 'info');
  } catch (err) { showToast(err.message, 'error'); }
}

// ── POST CREATION ─────────────────────────────────────────
export function openPostModal(type) {
  S.pendingMediaDataURL = null;
  S.pendingMediaIsVideo = false;
  S.pendingMediaFile    = null;
  const capInp = document.getElementById('post-caption-inp');
  if (capInp) capInp.value = document.getElementById('quick-caption')?.value || '';
  selectMediaType(type === 'story' ? 'photo' : type === 'text' ? 'text' : type === 'video' ? 'video' : 'photo');
  if (window.openModal) window.openModal('post-modal');
}

export function selectMediaType(type) {
  S.mediaType = type;
  ['photo', 'video', 'text'].forEach(t => document.getElementById('mt-' + t)?.classList.toggle('selected', t === type));
  const area = document.getElementById('media-preview-area');
  const hint = document.getElementById('media-hint');
  if (!area) return;
  if (type === 'text') { area.style.display = 'none'; return; }
  area.style.display = 'flex';
  if (!S.pendingMediaDataURL && hint) {
    hint.innerHTML = type === 'video'
      ? '<div class="big-icon">🎬</div><p>Click to upload video</p>'
      : '<div class="big-icon">📸</div><p>Click to upload photo</p>';
  }
  const fi = document.getElementById('media-file-input');
  if (fi) fi.accept = type === 'video' ? 'video/*' : 'image/*';
}

export function triggerMediaUpload() {
  document.getElementById('media-file-input')?.click();
}

export function handleMediaFile(input) {
  const file = input.files[0];
  if (!file) return;
  S.pendingMediaFile    = file;
  S.pendingMediaIsVideo = file.type.startsWith('video/');
  const reader = new FileReader();
  reader.onload = e => {
    S.pendingMediaDataURL = e.target.result;
    const area = document.getElementById('media-preview-area');
    const hint = document.getElementById('media-hint');
    if (hint) hint.style.display = 'none';
    const existing = area?.querySelector('img,video');
    if (existing) existing.remove();
    if (area) {
      const el = document.createElement(S.pendingMediaIsVideo ? 'video' : 'img');
      el.src = S.pendingMediaDataURL;
      el.style.cssText = 'max-width:100%;max-height:260px;object-fit:contain;border-radius:12px;';
      if (S.pendingMediaIsVideo) el.controls = true;
      area.appendChild(el);
    }
  };
  reader.readAsDataURL(file);
}

export async function submitPost() {
  const caption = document.getElementById('post-caption-inp')?.value.trim();
  if (S.mediaType !== 'text' && !S.pendingMediaFile && !caption) {
    showToast('Add a photo, video or caption!', 'error'); return;
  }
  const btn = document.querySelector('#post-modal .modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
  try {
    const { data } = await Posts.create(caption || '', S.pendingMediaFile || null);
    S.posts.unshift(data.post);
    if (window.closeModal) window.closeModal('post-modal');
    S.pendingMediaDataURL = null; S.pendingMediaIsVideo = false; S.pendingMediaFile = null;
    const qCap = document.getElementById('quick-caption');
    if (qCap) qCap.value = '';
    renderFeed();
    if (window.renderMiniProfile) window.renderMiniProfile();
    if (window.renderProfilePosts) window.renderProfilePosts();
    addNotification('📸', 'rgba(192,19,42,0.15)', 'Your new post is live!', 'Just now');
    showToast('Post shared! 🔥', 'success');
  } catch (err) {
    showToast(err.message || 'Post failed', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Post 🚀'; }
  }
}

export function quickTextPost() {
  const qCapEl = document.getElementById('quick-caption');
  const text   = qCapEl?.value.trim();
  if (!text) { openPostModal('photo'); return; }
  S.pendingMediaFile = null;
  document.getElementById('post-caption-inp') && (document.getElementById('post-caption-inp').value = text);
  submitPost().then(() => { if (qCapEl) qCapEl.value = ''; });
}

// ── SUGGESTED USERS ───────────────────────────────────────
export async function renderSuggested() {
  const list = document.getElementById('suggested-list');
  if (!list) return;
  try {
    const { data } = await Users.getSuggested();
    S.suggestedUsers = data.suggestions || [];
    if (!S.suggestedUsers.length) {
      list.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:0.5rem 0;">You\'re following everyone! 🎉</div>';
      return;
    }
    list.innerHTML = S.suggestedUsers.map(u => `
      <div style="display:flex;align-items:center;gap:9px;padding:6px 0;">
        <div style="width:34px;height:34px;border-radius:50%;background:${u.color||'#888'};overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;flex-shrink:0;">
          ${u.profileImageURL ? `<img src="${u.profileImageURL}" style="width:100%;height:100%;object-fit:cover;" />` : initials(u.name)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
          <div style="font-size:11px;color:var(--text3);">${u.course || ''}</div>
        </div>
        <button class="follow-btn" id="sug-${u._id}" onclick="window.toggleSuggestedFollow('${u._id}',this)">Follow</button>
      </div>`).join('');
    renderStories();
  } catch { /* non-fatal */ }
}

export async function toggleSuggestedFollow(uid, btn) {
  try {
    const { data } = await Users.follow(uid);
    btn.textContent = data.isFollowing ? 'Following' : 'Follow';
    btn.className   = 'follow-btn ' + (data.isFollowing ? 'following' : '');
    showToast(data.isFollowing ? 'Following! 🙌' : 'Unfollowed', data.isFollowing ? 'success' : 'info');
    if (window.renderMiniProfile) window.renderMiniProfile();
  } catch (err) { showToast(err.message, 'error'); }
}
