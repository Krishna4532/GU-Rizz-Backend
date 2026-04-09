import { S } from '../state.js';
import { initials, showToast } from '../helpers.js';
import { Users } from '../api.js';
import { addNotification } from './notifications.js';

export function switchExploreTab(tab) {
  document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
  const tabs = document.querySelectorAll('.explore-tab');
  if (tabs.length > 1) tabs[tab === 'search' ? 0 : 1].classList.add('active');
  document.getElementById('explore-search-view').style.display = tab === 'search'  ? 'block' : 'none';
  document.getElementById('explore-filter-view').style.display = tab === 'filters' ? 'block' : 'none';
  renderExplore();
}

export async function renderExplore() {
  const isSearchTab = document.getElementById('explore-search-view')?.style.display !== 'none';
  const container   = document.getElementById('explore-results');
  if (!container) return;

  container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px;">Searching...</div>';

  const params = {};

  if (isSearchTab) {
    const q = document.getElementById('explore-search-input')?.value.trim();
    if (q) params.q = q;
  } else {
    const fC  = document.getElementById('f-course')?.value;
    const fY  = document.getElementById('f-year')?.value;
    const fG  = document.getElementById('f-gender')?.value;
    const fHMin = document.getElementById('f-h-min')?.value;
    const fHMax = document.getElementById('f-h-max')?.value;
    if (fC)    params.course     = fC;
    if (fY)    params.year       = fY;
    if (fG)    params.gender     = fG;
    if (fHMin) params.minHeight  = fHMin;
    if (fHMax) params.maxHeight  = fHMax;
    if (S.filterState?.music?.length)   params.music   = S.filterState.music.join(',');
    if (S.filterState?.nature?.length)  params.nature  = S.filterState.nature[0];
  }

  try {
    const { data } = await Users.explore(params);
    const users = data.users || [];

    if (!users.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text3);padding:3rem;font-size:15px;">No users match your criteria 🤷</div>';
      return;
    }

    container.innerHTML = `<div class="users-grid">${users.map(u => {
      const img = u.profileImageURL;
      const avHtml = img
        ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : initials(u.name);
      return `
        <div class="user-card">
          <div class="uc-av" style="background:${u.color||'#888'}">${avHtml}</div>
          <div class="uc-name">${u.name}</div>
          <div class="uc-sub">@${u.username}</div>
          <div class="uc-tags">
            ${u.gender     ? `<span class="uc-tag">${u.gender}</span>`       : ''}
            ${u.age        ? `<span class="uc-tag">${u.age}yrs</span>`        : ''}
            ${u.course     ? `<span class="uc-tag">${u.course}</span>`        : ''}
            ${u.year       ? `<span class="uc-tag">${u.year}</span>`          : ''}
            ${u.height     ? `<span class="uc-tag">${u.height}cm</span>`      : ''}
            ${u.nature     ? `<span class="uc-tag">${u.nature}</span>`        : ''}
          </div>
          ${u.rizzPoints ? `<div class="uc-rizz">⚡ ${u.rizzPoints.toLocaleString()} Rizz</div>` : ''}
          ${u.music ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px;">🎵 ${u.music}</div>` : ''}
          ${u.bio   ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${u.bio}</div>` : ''}
          <button class="follow-btn ${u.isFollowing ? 'following' : ''}" id="ef-${u._id}" onclick="window.toggleFollowExplore('${u._id}', this)">
            ${u.isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>`;
    }).join('')}</div>`;
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;color:var(--text3);padding:2rem;">${err.message || 'Search failed'}</div>`;
  }
}

export function toggleChip(el, type) {
  el.classList.toggle('on');
  const v = el.textContent.trim();
  if (!S.filterState) S.filterState = { music: [], nature: [] };
  if (el.classList.contains('on')) S.filterState[type].push(v);
  else S.filterState[type] = S.filterState[type].filter(x => x !== v);
}

export function clearFilters() {
  ['f-course','f-year','f-h-min','f-h-max','f-gender','f-age'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  S.filterState = { music: [], nature: [] };
  renderExplore();
  showToast('Filters cleared', 'info');
}

export async function toggleFollow(uid) {
  try {
    const { data } = await Users.follow(uid);
    showToast(data.isFollowing ? 'Following! 🙌' : 'Unfollowed', data.isFollowing ? 'success' : 'info');
    if (data.isFollowing) addNotification('👤', 'rgba(192,19,42,0.15)', 'You followed someone new', 'Just now');
    if (window.renderMiniProfile) window.renderMiniProfile();
    return data.isFollowing;
  } catch (err) { showToast(err.message, 'error'); return false; }
}

export async function toggleFollowExplore(uid, btn) {
  const isNowFollowing = await toggleFollow(uid);
  btn.textContent = isNowFollowing ? 'Following' : 'Follow';
  btn.className   = 'follow-btn ' + (isNowFollowing ? 'following' : '');
}

export function gainFollower() {} // handled server-side
