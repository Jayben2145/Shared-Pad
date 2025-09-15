(() => {
  const socket = io();
  const pad = document.getElementById('pad');
  const users = document.getElementById('users');
  const sync = document.getElementById('sync');

  const room = pad ? pad.dataset.room : null;
  let applyingRemote = false;
  let lastAppliedVersion = 0;
  let pendingTimer = null;

  function setSync(state) {
    if (!sync) return;
    sync.classList.remove('ok', 'busy');
    if (state === 'busy') {
      sync.textContent = 'Syncing…';
      sync.classList.add('busy');
    } else {
      sync.textContent = 'Synced';
      sync.classList.add('ok');
    }
  }

  if (room) {
    socket.emit('join', { room });
  }

  socket.on('init', ({ text, version }) => {
    if (!pad) return;
    applyingRemote = true;
    pad.value = text || '';
    applyingRemote = false;
    lastAppliedVersion = version || 0;
    setSync('ok');
  });

  socket.on('user-count', (n) => {
    if (users) users.textContent = `${n} online`;
  });

  socket.on('text-apply', ({ text, version }) => {
    if (!pad || typeof text !== 'string') return;
    if (!version || version <= lastAppliedVersion) return;
    const start = pad.selectionStart, end = pad.selectionEnd;
    applyingRemote = true;
    pad.value = text;
    applyingRemote = false;
    lastAppliedVersion = version;
    try {
      const len = pad.value.length;
      pad.selectionStart = Math.min(start, len);
      pad.selectionEnd = Math.min(end, len);
    } catch {}
    setSync('ok');
  });

  function sendUpdate() {
    if (!pad || applyingRemote) return;
    setSync('busy');
    socket.emit('text-update', { room, text: pad.value });
  }

  if (pad) {
    pad.addEventListener('input', () => {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(sendUpdate, 60);
    });
  }
})();
