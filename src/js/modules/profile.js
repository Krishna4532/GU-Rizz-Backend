import { S } from '../state.js';
import { initials, showToast } from '../helpers.js';
import { Users, Posts, Vibe } from '../api.js';

export async function renderMiniProfile() {
  const u = S.user;
  if (!u) return;
  const av = document.getElementById('pm-av');
  if (av) {
    if (u.profileImageURL) {
      av.innerHTML = `<img src="${u.profileImageURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      av.style.background = 'transparent';
    } else {
      av.textContent = initials(u.name);
      av.style.background = u.color || '#c0132a';
    }
  }
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('pm-name',       u.name);
  setEl('pm-handle',     '@' + (u.username || 'user'));
  setEl('pm-posts',      u.postsCount || S.posts.length);
  setEl('pm-followers',  u.followersCount || 0);
  setEl('pm-following',  u.followingCount || 0);
}

export async function renderProfile() {
  const u = S.user;
  if (!u) return;

  // Fetch latest profile from server
  try {
    const { data } = await Users.getProfile(u.username);
    Object.assign(S.user, data.user);
  } catch { /* use cached */ }

  const cu = S.user;

  // Avatar
  const av = document.getElementById('prof-main-av');
  if (av) {
    if (cu.profileImageURL) {
      av.innerHTML = `<img src="${cu.profileImageURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/><div class="av-upload-overlay" onclick="window.showAvatarOptions()">📷</div>`;
      av.style.background = 'transparent';
    } else {
      av.innerHTML = `${initials(cu.name)}<div class="av-upload-overlay" onclick="window.showAvatarOptions()">📷</div>`;
      av.style.background = cu.color || '#c0132a';
    }
  }

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
  setEl('prof-full-name', cu.name);
  setEl('prof-handle',    '@' + (cu.username || 'user'));
  setEl('prof-posts',     cu.postsCount || 0);
  setEl('prof-followers', cu.followersCount || 0);
  setEl('prof-following', cu.followingCount || 0);
  setEl('prof-rizz',      cu.rizzPoints || 0);
  setEl('pd-age',         cu.age ? cu.age + ' yrs' : null);
  setEl('pd-height',      cu.height ? cu.height + ' cm' : null);
  setEl('pd-dob',         cu.dob || null);
  setEl('pd-nature',      cu.nature || null);
  setEl('pd-course',      cu.course || null);
  setEl('pd-year',        cu.year || null);
  setEl('pd-music',       cu.music || null);

  // Badges
  const badges = [];
  if (cu.rizzPoints >= 500) badges.push({ icon: '🔥', label: 'High Rizz' });
  if ((cu.followingCount || 0) >= 5) badges.push({ icon: '🤝', label: 'Social' });
  if ((cu.postsCount || 0) >= 3) badges.push({ icon: '📸', label: 'Creator' });
  if (cu.isVerified) badges.push({ icon: '✅', label: 'Verified GU' });
  badges.push({ icon: '🎓', label: 'GU-Rizz Member' });
  const badgesEl = document.getElementById('prof-badges');
  if (badgesEl) badgesEl.innerHTML = badges.map(b => `<div class="profile-badge">${b.icon} ${b.label}</div>`).join('');

  // Highlights
  const hl = [
    { e: '📸', l: 'Campus' }, { e: '🎓', l: 'Study' },
    { e: '🎶', l: 'Music' },  { e: '🏃', l: 'Sports' }, { e: '🌙', l: 'Night' },
  ];
  const hlEl = document.getElementById('profile-highlights');
  if (hlEl) hlEl.innerHTML = hl.map(h => `
    <div class="hl-item" onclick="window.showToast('${h.l} highlights','info')">
      <div class="hl-ring"><div class="hl-inner">${h.e}</div></div>
      <div class="hl-name">${h.l}</div>
    </div>`).join('');

  // Gifts received
  renderReceivedGifts();

  // Posts grid
  renderProfilePosts();
}

async function renderReceivedGifts() {
  const recRow = document.getElementById('received-row');
  if (!recRow) return;
  try {
    const { data } = await Vibe.getReceivedGifts(S.user._id || S.user.id);
    const gifts = data.gifts || [];
    recRow.innerHTML = gifts.length
      ? gifts.map(g => `<div class="received-item"><span class="received-emoji">${g.giftEmoji || '🎁'}</span>${g.giftName}</div>`).join('')
      : '<span style="font-size:13px;color:var(--text3);">No gifts yet — drop hints! 😅</span>';
  } catch {
    recRow.innerHTML = '<span style="font-size:13px;color:var(--text3);">No gifts yet</span>';
  }
}

export async function renderProfilePosts() {
  const grid = document.getElementById('profile-posts-grid');
  if (!grid) return;
  try {
    const userId = S.user._id || S.user.id;
    const { data } = await Posts.getUserPosts(userId, 1);
    const posts = data.posts || [];
    if (!posts.length) {
      grid.innerHTML = Array(6).fill(0).map(() => `<div class="profile-post-thumb" style="opacity:0.15;cursor:default;">📷</div>`).join('');
      return;
    }
    grid.innerHTML = posts.map(p => `
      <div class="profile-post-thumb" onclick="window.showToast('${p.caption ? p.caption.slice(0,20) + '...' : '✨ Post'}','info')">
        ${p.mediaURL && !p.isVideo ? `<img src="${p.mediaURL}" />` :
          p.mediaURL && p.isVideo  ? `<video src="${p.mediaURL}" muted></video>` :
          p.emoji || '📸'}
        <div class="thumb-overlay">❤️ ${p.likesCount || 0} &nbsp; 💬 ${(p.comments||[]).length}</div>
      </div>`).join('');
  } catch {
    grid.innerHTML = Array(6).fill(0).map(() => `<div class="profile-post-thumb" style="opacity:0.1;cursor:default;">📷</div>`).join('');
  }
}

export function showAvatarOptions() {
  document.getElementById('av-upload')?.click();
}

export async function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = document.getElementById('prof-main-av');
  try {
    showToast('Uploading...', 'info');
    const { data } = await Users.uploadAvatar(file);
    S.user.profileImageURL = data.profileImageURL;
    if (window.updateNavUI) window.updateNavUI();
    renderMiniProfile();
    renderProfile();
    showToast('Profile photo updated! 📸', 'success');
  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  }
}

// ── EDIT PROFILE ─────────────────────────────────────────
export async function saveProfileEdits() {
  const fields = ['name','bio','course','year','music','nature','height','age'];
  const updates = {};
  fields.forEach(f => {
    const el = document.getElementById('edit-' + f);
    if (el && el.value !== undefined) updates[f] = el.value;
  });
  try {
    const { data } = await Users.updateProfile(updates);
    Object.assign(S.user, data.user);
    renderProfile();
    if (window.updateNavUI) window.updateNavUI();
    showToast('Profile updated! ✅', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
