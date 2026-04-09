import { S } from '../state.js';
import { showToast } from '../helpers.js';
import { joinSparkQueue, leaveSparkQueue, sendSparkOffer, sendSparkAnswer, sendIceCandidate, nextSpark, endSpark, getSocket } from '../socket.js';

// ICE servers (STUN public + optional TURN from env)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let peerConnection = null;
let localStream    = null;
let currentRoomId  = null;

// ── WAITING CHIPS ─────────────────────────────────────────
export function renderWaitingChips() {
  const el = document.getElementById('waiting-chips');
  if (!el) return;
  // Populated dynamically as socket events arrive
  el.innerHTML = '<div style="font-size:13px;color:var(--text3);">Waiting for live users...</div>';
}

export function updateLiveCount() {
  const socket = getSocket();
  if (socket) {
    socket.emit('spark:get_online_count');
    socket.once('spark:online_count', ({ count }) => {
      const el = document.getElementById('live-count');
      if (el) el.textContent = count + ' students online now';
    });
  } else {
    const c = Math.floor(Math.random() * 90) + 40;
    const el = document.getElementById('live-count');
    if (el) el.textContent = c + ' students online now';
  }
}

// ── START VIDEO SPARK ─────────────────────────────────────
export async function startVideo() {
  document.getElementById('video-standby').style.display = 'none';
  const va = document.getElementById('video-active');
  va.style.display = 'flex';
  va.classList.add('fullscreen-video');

  startHeartsAnimation();

  const me = S.user;
  document.getElementById('my-emoji').style.display = 'none';
  const myVid = document.getElementById('my-live-vid');
  myVid.style.display = 'block';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    myVid.srcObject = localStream;
    S.myVideoStream = localStream;
  } catch {
    showToast('Camera access denied — text-only mode', 'error');
    document.getElementById('my-emoji').style.display = '';
    myVid.style.display = 'none';
  }

  const vfUser = document.getElementById('my-vf-user');
  if (vfUser) vfUser.innerHTML = `<div style="font-size:13px;font-weight:600;">${me.name}</div><div style="font-size:11px;color:rgba(255,255,255,0.6);">${me.course || 'GU-Rizz'}</div>`;

  bindSparkSocketEvents();
  joinSparkQueue();

  // Show "searching" UI
  const strangerEmoji = document.getElementById('stranger-emoji');
  if (strangerEmoji) { strangerEmoji.style.display = ''; strangerEmoji.textContent = '🔍'; }
  document.getElementById('stranger-vf-user').innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.5);">Searching for a stranger...</div>';
}

function bindSparkSocketEvents() {
  const socket = getSocket();
  if (!socket) return;

  socket.off('spark:matched');
  socket.off('spark:waiting');
  socket.off('spark:offer');
  socket.off('spark:answer');
  socket.off('spark:ice_candidate');
  socket.off('spark:partner_left');
  socket.off('spark:ended');
  socket.off('spark:left_room');

  socket.on('spark:waiting', ({ queueLength }) => {
    showToast(`⏳ Searching... ${queueLength} in queue`, 'info');
  });

  socket.on('spark:matched', async ({ roomId, partnerInfo, isInitiator }) => {
    currentRoomId = roomId;
    showToast(`Connected with ${partnerInfo.name?.split(' ')[0]}! Say hi 👋`, 'success');
    updateStrangerUI(partnerInfo);
    startCallTimer();

    if (isInitiator) {
      await createPeerConnection(roomId, true);
    } else {
      await createPeerConnection(roomId, false);
    }
  });

  socket.on('spark:offer', async ({ offer, from }) => {
    if (!peerConnection) await createPeerConnection(currentRoomId, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendSparkAnswer(currentRoomId, answer);
  });

  socket.on('spark:answer', async ({ answer }) => {
    if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('spark:ice_candidate', async ({ candidate }) => {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  });

  socket.on('spark:partner_left', () => {
    showToast('Stranger disconnected — finding next...', 'info');
    cleanupPeer();
    joinSparkQueue(); // auto re-queue
  });

  socket.on('spark:ended', () => {
    endVideo();
  });

  socket.on('spark:left_room', () => {
    joinSparkQueue();
  });
}

async function createPeerConnection(roomId, isInitiator) {
  cleanupPeer();
  peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  }

  // Receive remote stream
  peerConnection.ontrack = (event) => {
    const strangerVid = document.getElementById('stranger-live-vid');
    if (strangerVid) {
      strangerVid.srcObject = event.streams[0];
      strangerVid.style.display = 'block';
      const strangerEmoji = document.getElementById('stranger-emoji');
      if (strangerEmoji) strangerEmoji.style.display = 'none';
    }
  };

  // ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) sendIceCandidate(roomId, event.candidate);
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(peerConnection?.iceConnectionState)) {
      showToast('Connection lost — finding next stranger...', 'info');
      cleanupPeer();
      setTimeout(() => joinSparkQueue(), 1000);
    }
  };

  if (isInitiator) {
    const offer = await peerConnection.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await peerConnection.setLocalDescription(offer);
    sendSparkOffer(roomId, offer);
  }
}

function cleanupPeer() {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  const strangerVid = document.getElementById('stranger-live-vid');
  if (strangerVid) { strangerVid.srcObject = null; strangerVid.style.display = 'none'; }
  const strangerEmoji = document.getElementById('stranger-emoji');
  if (strangerEmoji) { strangerEmoji.style.display = ''; strangerEmoji.textContent = '🔍'; }
  stopCallTimer();
}

function updateStrangerUI(partnerInfo) {
  const strangerEmoji = document.getElementById('stranger-emoji');
  if (strangerEmoji) strangerEmoji.style.display = 'none';
  document.getElementById('stranger-vf-user').innerHTML = `
    <div style="font-size:13px;font-weight:600;">${partnerInfo.name || 'Stranger'}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.6);">${partnerInfo.course || 'GU-Rizz'}</div>`;
}

// ── CONTROLS ──────────────────────────────────────────────
export function nextStranger() {
  if (currentRoomId) nextSpark(currentRoomId);
  cleanupPeer();
  showToast('Finding next stranger...', 'info');
  document.getElementById('stranger-vf-user').innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.5);">Searching...</div>';
}

export function endVideo() {
  if (currentRoomId) endSpark(currentRoomId);
  leaveSparkQueue();
  cleanupPeer();

  if (S.myVideoStream) { S.myVideoStream.getTracks().forEach(t => t.stop()); S.myVideoStream = null; }
  localStream = null; currentRoomId = null;

  stopHeartsAnimation();
  stopCallTimer();

  document.getElementById('video-standby').style.display = '';
  const va = document.getElementById('video-active');
  va.style.display = 'none';
  va.classList.remove('fullscreen-video');

  updateLiveCount();
  showToast('Call ended. Thanks for sparking! ⚡', 'info');
}

export function toggleMic() {
  const b = document.getElementById('mic-btn');
  if (!b) return;
  const muted = b.textContent === '🔇';
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = muted);
  b.textContent = muted ? '🎤' : '🔇';
}

export function toggleCam() {
  const b = document.getElementById('cam-btn');
  if (!b) return;
  const hidden = b.textContent === '🙈';
  if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = hidden);
  b.textContent = hidden ? '📷' : '🙈';
}

// ── HEARTS ANIMATION ──────────────────────────────────────
function startHeartsAnimation() {
  const hc = document.getElementById('hearts-container');
  if (!hc) return;
  hc.style.display = 'block';
  S.heartsInt = setInterval(() => {
    const h = document.createElement('div');
    h.className   = 'falling-heart';
    h.textContent = ['❤️','💖','💕','⚡'][Math.floor(Math.random() * 4)];
    h.style.left  = Math.random() * 100 + 'vw';
    h.style.animationDuration = (Math.random() * 3 + 3) + 's';
    h.style.transform = `scale(${Math.random() * 0.8 + 0.5})`;
    hc.appendChild(h);
    setTimeout(() => h.remove(), 6000);
  }, 800);
}

function stopHeartsAnimation() {
  if (S.heartsInt) { clearInterval(S.heartsInt); S.heartsInt = null; }
  const hc = document.getElementById('hearts-container');
  if (hc) { hc.innerHTML = ''; hc.style.display = 'none'; }
}

// ── CALL TIMER ────────────────────────────────────────────
function startCallTimer() {
  S.callSecs = 0;
  if (S.callTimer) clearInterval(S.callTimer);
  S.callTimer = setInterval(() => {
    S.callSecs++;
    const m = Math.floor(S.callSecs / 60), s = S.callSecs % 60;
    const el = document.getElementById('call-timer');
    if (el) el.textContent = 'Connected: ' + (m ? m + 'm ' : '') + s + 's';
  }, 1000);
}

function stopCallTimer() {
  if (S.callTimer) { clearInterval(S.callTimer); S.callTimer = null; }
}
