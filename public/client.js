(() => {
  const socket = io();
  const pad = document.getElementById('pad');
  const users = document.getElementById('users');
  const sync = document.getElementById('sync');

  let applyingRemote = false;
  let lastAppliedVersion = 0;
  let pendingTimer = null;

  function setSync(state) {
    sync.classList.remove('ok', 'busy');
    if (state === 'busy') {
      sync.textContent = 'Syncing…';
      sync.classList.add('busy');
    } else {
      sync.textContent = 'Synced';
      sync.classList.add('ok');
    }
  }

  // init from server
  socket.on('init', ({ text, version }) => {
    applyingRemote = true;
    pad.value = text || '';
    applyingRemote = false;
    lastAppliedVersion = version || 0;
    setSync('ok');
  });

  // user count
  socket.on('user-count', (n) => {
    users.textContent = `${n} online`;
  });

  // apply remote updates
  socket.on('text-apply', ({ text, version }) => {
    if (typeof text !== 'string') return;
    if (!version || version <= lastAppliedVersion) return;
    const start = pad.selectionStart, end = pad.selectionEnd;
    applyingRemote = true;
    pad.value = text;
    applyingRemote = false;
    lastAppliedVersion = version;
    // try keep caret if possible
    try {
      const len = pad.value.length;
      pad.selectionStart = Math.min(start, len);
      pad.selectionEnd = Math.min(end, len);
    } catch {}
    setSync('ok');
  });

  // throttle user input → send to server
  function sendUpdate() {
    if (applyingRemote) return;
    setSync('busy');
    socket.emit('text-update', { text: pad.value });
  }
  pad.addEventListener('input', () => {
    clearTimeout(pendingTimer);
    // light debounce to avoid spamming
    pendingTimer = setTimeout(sendUpdate, 60);
  });
})();
