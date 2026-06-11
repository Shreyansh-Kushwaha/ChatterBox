/* ============================================================
   ChatterBox — Client Application
   ============================================================ */

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── DOM refs ─────────────────────────────────────────────────
const D = {
  modalOverlay:    $('modal-overlay'),
  usernameInput:   $('username-input'),
  joinBtn:         $('join-btn'),
  modalRoomPicker: $('modal-room-picker'),
  app:             $('app'),
  sidebar:         $('sidebar'),
  sidebarToggle:   $('sidebar-toggle'),
  sidebarClose:    $('sidebar-close'),
  sidebarBackdrop: $('sidebar-backdrop'),
  roomsList:       $('rooms-list'),
  onlineCount:     $('online-count'),
  usersList:       $('users-list'),
  headerRoomName:  $('header-room-name'),
  headerUserCount: $('header-user-count'),
  messages:        $('messages'),
  typingBar:       $('typing-bar'),
  emojiPicker:     $('emoji-picker'),
  emojiCats:       $('emoji-cats'),
  emojiGrid:       $('emoji-grid'),
  emojiBtn:        $('emoji-btn'),
  msgInput:        $('msg-input'),
  sendBtn:         $('send-btn'),
  soundBtn:        $('sound-btn'),
  soundIcon:       $('sound-icon'),
  themeBtn:        $('theme-btn'),
  themeIcon:       $('theme-icon'),
};

// ── State ─────────────────────────────────────────────────────
let myId       = null;
let myUsername = '';
let currentRoom = 'general';
let pendingRoom  = 'general';  // selected in modal
let soundEnabled = true;
let sidebarOpen  = false;
let emojiPickerOpen = false;
let activeCatKey = null;
let hasJoined    = false;      // true after first successful join

// typing: Map<socketId, { username, timer }>  — keyed by ID not name
const typingUsers = new Map();
let  localTyping  = false;
let  localTypingTimer = null;

// track last sender for grouping consecutive messages
let lastSenderId = null;
let lastSenderTs = 0;
const GROUP_GAP_MS = 60_000; // group bubbles within 1 min

// ── Emoji data ────────────────────────────────────────────────
const EMOJI_CATS = {
  '😊': ['😀','😃','😄','😁','😆','🤣','😂','😊','🥰','😍','🤩','😘','😋','😜','🤪','😝','🤑','🤗','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🥱','😷','🤒','🤕','🥴','🤯','😎','🥸','🤓','😕','😟','😢','😭','😤','😠','😡','🤬','😈','💀','👻','🤡'],
  '👋': ['👋','🤚','🖐️','✋','🤙','👆','👇','👈','👉','☝️','👍','👎','✊','👊','🤜','🤛','🙌','👏','🤲','🙏','💪','🤝','💅','🫶'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🌸','🌺','🌻','🌹','💐','🍀','🌿','🌱','🌲','⭐','🌟','✨','☀️','🌈','🌊','❄️','🔥','💧'],
  '🍕': ['🍕','🍔','🌮','🌯','🍜','🍱','🍣','🍦','🎂','🍩','🍪','🍫','🍬','🍭','🍷','🍺','☕','🍵','🧋','🥤','🍎','🍊','🍋','🍇','🍓','🫐','🥑','🥦','🥕','🧁'],
  '⚽': ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🏸','🥊','🎯','🎮','🕹️','🎲','🎭','🎨','🎵','🎶','🎤','🎧','🎸','🎹','🏆','🥇','🎉','🎊','🎁','🎈','🎀','✨'],
  '✈️': ['✈️','🚀','🛸','🚗','🚕','🚌','🚢','🚂','🏠','🏢','🏰','🗼','🗽','🌍','🌎','🌏','🗺️','🧭','🏖️','🏝️','🌋','🌁'],
  '💻': ['💻','📱','⌨️','🖥️','📷','📸','📹','🎥','📡','🔭','🔬','💡','🔦','📚','📝','✏️','🔑','🔒','💰','💳','📢','🔔','💬','📧','🖨️'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','✅','❌','⚠️','❓','❗','💯','💢','🔥','🆕','🆗','🆘','✔️','➕','➖'],
};

const CAT_LABELS = {
  '😊': 'Smileys', '👋': 'Gestures', '🐶': 'Nature',
  '🍕': 'Food',    '⚽': 'Activity', '✈️': 'Travel',
  '💻': 'Objects', '❤️': 'Symbols',
};

// ── Room meta ─────────────────────────────────────────────────
const ROOM_META = {
  general: { icon: '🌍', label: 'General' },
  tech:    { icon: '💻', label: 'Tech'    },
  gaming:  { icon: '🎮', label: 'Gaming'  },
  random:  { icon: '🎲', label: 'Random'  },
};

// ── Socket ────────────────────────────────────────────────────
const socket = io();

// ── Helpers ───────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isNearBottom() {
  const m = D.messages;
  return m.scrollHeight - m.scrollTop - m.clientHeight < 80;
}

function scrollToBottom(instant = false) {
  D.messages.scrollTo({ top: D.messages.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
}

// ── Sound ─────────────────────────────────────────────────────
function playNotification() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) { /* browsers may block autoplay */ }
}

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  D.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('cb-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ── Messages ──────────────────────────────────────────────────
function appendMessage(msg, instant = false) {
  const atBottom = isNearBottom();

  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = msg.text;
    D.messages.appendChild(el);
    lastSenderId = null;
    lastSenderTs = 0;

  } else {
    const isOwn = msg.sender === myId;
    const ts    = msg.timestamp || Date.now();

    // Grouping: same sender within GROUP_GAP_MS (own messages group too)
    const sameGroup = lastSenderId === msg.sender
      && (ts - lastSenderTs) < GROUP_GAP_MS;

    const row = document.createElement('div');
    row.className = `msg-row ${isOwn ? 'own' : 'other'}${sameGroup ? ' same-sender' : ''}`;

    if (!isOwn) {
      const nameEl = document.createElement('div');
      nameEl.className = 'msg-sender';
      nameEl.textContent = msg.username || 'Unknown';
      row.appendChild(nameEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    row.appendChild(bubble);

    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = formatTime(ts);
    row.appendChild(timeEl);

    D.messages.appendChild(row);

    lastSenderId = msg.sender;
    lastSenderTs = ts;
  }

  if (atBottom || instant) scrollToBottom(instant);
}

function loadHistory(history) {
  D.messages.innerHTML = '';
  lastSenderId = null;
  lastSenderTs = 0;

  if (history.length === 0) {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = 'No messages yet. Say hello!';
    D.messages.appendChild(el);
  } else {
    // Use fragment for batch DOM insertion
    history.forEach(msg => appendMessage(msg, false));
  }
  scrollToBottom(true);
}

// ── Typing indicator ──────────────────────────────────────────
function updateTypingBar() {
  const entries = [...typingUsers.values()];

  if (entries.length === 0) {
    D.typingBar.innerHTML = '';
    return;
  }

  const names = entries.map(e => escapeHTML(e.username));
  let label;
  if (names.length === 1) label = `${names[0]} is typing`;
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing`;
  else label = 'Several people are typing';

  D.typingBar.innerHTML = `
    <span class="typing-dots"><span></span><span></span><span></span></span>
    <span>${label}…</span>
  `;
}

function handleIncomingTyping({ username, id, typing }) {
  // Key by socket ID so duplicate usernames don't clash
  const key = id || username;
  if (typing) {
    if (typingUsers.has(key)) clearTimeout(typingUsers.get(key).timer);
    const timer = setTimeout(() => {
      typingUsers.delete(key);
      updateTypingBar();
    }, 2300); // shorter than the local 2500 ms stop — remote always clears first
    typingUsers.set(key, { username, timer });
  } else {
    if (typingUsers.has(key)) {
      clearTimeout(typingUsers.get(key).timer);
      typingUsers.delete(key);
    }
  }
  updateTypingBar();
}

function clearTypingState() {
  typingUsers.forEach(({ timer }) => clearTimeout(timer));
  typingUsers.clear();
  updateTypingBar();
}

// ── Local typing events ───────────────────────────────────────
function onLocalTyping() {
  if (!localTyping) {
    localTyping = true;
    socket.emit('typing', true);
  }
  clearTimeout(localTypingTimer);
  localTypingTimer = setTimeout(() => {
    localTyping = false;
    socket.emit('typing', false);
  }, 2500);
}

function stopLocalTyping() {
  if (localTyping) {
    localTyping = false;
    socket.emit('typing', false);
  }
  clearTimeout(localTypingTimer);
}

// ── Send message ──────────────────────────────────────────────
function sendMessage() {
  const text = D.msgInput.value.trim();
  if (!text) return;
  socket.emit('user-message', text);
  D.msgInput.value = '';
  stopLocalTyping();
  closeEmojiPicker();
}

// ── Users list ────────────────────────────────────────────────
function renderUsersList(users) {
  const count = users.length;
  D.onlineCount.textContent = count;
  D.headerUserCount.textContent = `${count} online`;

  D.usersList.innerHTML = '';
  users.forEach(username => {
    const isMe = username === myUsername;
    const item = document.createElement('div');
    item.className = `user-item${isMe ? ' is-me' : ''}`;
    item.innerHTML = `
      <div class="user-dot"></div>
      <span>${escapeHTML(username)}</span>
      ${isMe ? '<span class="user-me-badge">you</span>' : ''}
    `;
    D.usersList.appendChild(item);
  });
}

// ── Room switching ────────────────────────────────────────────
function switchRoom(room) {
  if (room === currentRoom) return;
  currentRoom = room;
  clearTypingState();

  const meta = ROOM_META[room];
  D.headerRoomName.textContent = `${meta.icon} ${meta.label}`;
  document.title = `ChatterBox — ${meta.label}`;

  // Update sidebar
  qsa('.room-btn', D.sidebar).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.room === room);
  });

  socket.emit('switch-room', room);
  closeSidebar();
}

// ── Sidebar ───────────────────────────────────────────────────
function openSidebar() {
  sidebarOpen = true;
  D.sidebar.classList.add('open');
  D.sidebarBackdrop.classList.add('visible');
}

function closeSidebar() {
  sidebarOpen = false;
  D.sidebar.classList.remove('open');
  D.sidebarBackdrop.classList.remove('visible');
}

function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}

// ── Emoji picker ──────────────────────────────────────────────
function buildEmojiPicker() {
  const keys = Object.keys(EMOJI_CATS);
  activeCatKey = keys[0];

  D.emojiCats.innerHTML = '';
  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.className = `emoji-cat-btn${key === activeCatKey ? ' active' : ''}`;
    btn.textContent = key;
    btn.title = CAT_LABELS[key] || key;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      activeCatKey = key;
      qsa('.emoji-cat-btn', D.emojiPicker).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEmojiGrid(key);
    });
    D.emojiCats.appendChild(btn);
  });

  renderEmojiGrid(activeCatKey);
}

function renderEmojiGrid(catKey) {
  D.emojiGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  (EMOJI_CATS[catKey] || []).forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn-item';
    btn.textContent = emoji;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      insertEmoji(emoji);
    });
    frag.appendChild(btn);
  });
  D.emojiGrid.appendChild(frag);
}

function insertEmoji(emoji) {
  const input = D.msgInput;
  const start = input.selectionStart;
  const end   = input.selectionEnd;
  const val   = input.value;
  input.value = val.slice(0, start) + emoji + val.slice(end);
  const pos = start + emoji.length;
  input.setSelectionRange(pos, pos);
  input.focus();
}

function openEmojiPicker() {
  emojiPickerOpen = true;
  D.emojiPicker.classList.remove('hidden');
  D.emojiBtn.style.color = 'var(--accent)';
}

function closeEmojiPicker() {
  emojiPickerOpen = false;
  D.emojiPicker.classList.add('hidden');
  D.emojiBtn.style.color = '';
}

function toggleEmojiPicker(e) {
  e.stopPropagation();
  emojiPickerOpen ? closeEmojiPicker() : openEmojiPicker();
}

// ── Join flow ─────────────────────────────────────────────────
function showApp(username, room) {
  myUsername = username;
  currentRoom = room;

  // Save username for next visit
  localStorage.setItem('cb-username', username);

  // Hide modal, show app
  D.modalOverlay.classList.add('hidden');
  D.app.classList.remove('hidden');

  // Update header
  const meta = ROOM_META[room] || ROOM_META.general;
  D.headerRoomName.textContent = `${meta.icon} ${meta.label}`;
  document.title = `ChatterBox — ${meta.label}`;

  // Sync sidebar room highlight
  qsa('.room-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.room === room);
  });

  D.msgInput.focus();
}

// ── Socket events ─────────────────────────────────────────────

// On reconnect, re-emit join so the server restores room state and presence
socket.on('connect', () => {
  if (hasJoined && myUsername && currentRoom) {
    socket.emit('join', { username: myUsername, room: currentRoom });
  }
});

socket.on('joined', ({ username, room }) => {
  myId = socket.id;  // always refresh — new socket ID after every reconnect
  if (!hasJoined) {
    hasJoined = true;
    showApp(username, room);
  }
});

socket.on('load-history', history => {
  loadHistory(history);
});

socket.on('message', msg => {
  const isOwnChat = msg.type === 'chat' && msg.sender === myId;

  appendMessage(msg);

  // Play sound for incoming messages from others (not system noise, not own)
  if (msg.type === 'chat' && !isOwnChat) {
    playNotification();
  }

  // Remove typing indicator for this sender (keyed by socket ID)
  if (msg.type === 'chat' && msg.sender) {
    if (typingUsers.has(msg.sender)) {
      clearTimeout(typingUsers.get(msg.sender).timer);
      typingUsers.delete(msg.sender);
      updateTypingBar();
    }
  }
});

socket.on('typing', handleIncomingTyping);

socket.on('users-list', renderUsersList);

socket.on('disconnect', () => {
  clearTypingState();
});

// ── UI event listeners ────────────────────────────────────────

// Modal: username input enables/disables Join button
D.usernameInput.addEventListener('input', () => {
  D.joinBtn.disabled = D.usernameInput.value.trim().length === 0;
});

D.usernameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !D.joinBtn.disabled) D.joinBtn.click();
});

// Modal: room chip selection
qsa('.room-chip', D.modalRoomPicker).forEach(chip => {
  chip.addEventListener('click', () => {
    qsa('.room-chip', D.modalRoomPicker).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    pendingRoom = chip.dataset.room;
  });
});

// Join button — with timeout recovery so it never stays stuck
D.joinBtn.addEventListener('click', () => {
  const username = D.usernameInput.value.trim();
  if (!username) return;
  D.joinBtn.disabled = true;
  D.joinBtn.textContent = 'Joining…';
  socket.emit('join', { username, room: pendingRoom });

  const resetBtn = () => {
    if (hasJoined) return;
    D.joinBtn.disabled = false;
    D.joinBtn.textContent = 'Enter Chat';
  };

  // Restore button after 6 s if server never responds
  const timeout = setTimeout(resetBtn, 6000);
  socket.once('joined', () => clearTimeout(timeout));
});

// Re-enable button immediately on connection error
socket.on('connect_error', () => {
  if (!hasJoined) {
    D.joinBtn.disabled = false;
    D.joinBtn.textContent = 'Enter Chat';
  }
});

// Sidebar toggle
D.sidebarToggle.addEventListener('click', toggleSidebar);
D.sidebarClose.addEventListener('click', closeSidebar);
D.sidebarBackdrop.addEventListener('click', closeSidebar);

// Sidebar room buttons
qsa('.room-btn', D.sidebar).forEach(btn => {
  btn.addEventListener('click', () => switchRoom(btn.dataset.room));
});

// Send
D.sendBtn.addEventListener('click', sendMessage);

D.msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

D.msgInput.addEventListener('input', onLocalTyping);
D.msgInput.addEventListener('blur', stopLocalTyping);

// Emoji picker
D.emojiBtn.addEventListener('click', toggleEmojiPicker);

// Close emoji picker on outside click
document.addEventListener('click', e => {
  if (emojiPickerOpen && !D.emojiPicker.contains(e.target) && e.target !== D.emojiBtn) {
    closeEmojiPicker();
  }
});

// Close sidebar on outside click / Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSidebar();
    closeEmojiPicker();
  }
});

// Sound toggle
D.soundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  D.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
  localStorage.setItem('cb-sound', soundEnabled ? '1' : '0');
});

// Theme toggle
D.themeBtn.addEventListener('click', toggleTheme);

// ── Init ──────────────────────────────────────────────────────
function init() {
  // Restore theme immediately (prevents flash)
  const savedTheme = localStorage.getItem('cb-theme') || 'dark';
  applyTheme(savedTheme);

  // Restore sound preference
  const savedSound = localStorage.getItem('cb-sound');
  if (savedSound === '0') {
    soundEnabled = false;
    D.soundIcon.textContent = '🔕';
  }

  // Pre-fill saved username
  const savedUsername = localStorage.getItem('cb-username') || '';
  if (savedUsername) {
    D.usernameInput.value = savedUsername;
    D.joinBtn.disabled = false;
  }

  // Build emoji picker
  buildEmojiPicker();

  // Focus username input
  D.usernameInput.focus();
}

init();
