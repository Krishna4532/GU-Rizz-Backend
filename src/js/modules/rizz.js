import { S } from '../state.js';
import { Users } from '../api.js';

let _timeRef = null;
let _accumulated = 0;  // minutes accumulated since last heartbeat

export function startTimeTracking() {
  _timeRef = Date.now();
  _accumulated = 0;

  // Send heartbeat every 5 minutes
  S._timeInterval = setInterval(async () => {
    _accumulated += 5;
    try {
      const { data } = await Users.heartbeat(5);
      if (S.user) S.user.rizzPoints = data.rizzPoints;
      updateRizzDisplay();
    } catch { /* non-fatal */ }
  }, 5 * 60 * 1000);
}

export function stopTimeTracking() {
  if (S._timeInterval) clearInterval(S._timeInterval);
}

// Local optimistic rizz add (server is authoritative — socket will sync actual value)
export function addRizz(pts, notify = true) {
  if (!S.user) return;
  S.user.rizzPoints = (S.user.rizzPoints || 0) + pts;
  updateRizzDisplay();
}

export function updateRizzDisplay() {
  const r = S.user?.rizzPoints || 0;
  [
    ['nav-rizz',       '⚡ ' + r],
    ['pm-rizz-val',    r],
    ['sidebar-rizz',   r],
    ['gifts-rizz-val', r],
    ['prof-rizz',      r],
    ['my-rizz-val',    r],
  ].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}
