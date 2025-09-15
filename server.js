const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Persistence per room ---
const DATA_DIR = path.join(__dirname, 'data', 'pads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// in-memory state: { [room]: { text, version } }
const pads = Object.create(null);
// save timers per room
const saveTimers = Object.create(null);

function sanitizeRoom(input) {
  if (!input) return '';
  // letters, numbers, dash, underscore; lowercased; max 64 chars
  return String(input).toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 64);
}

function padFile(room) {
  return path.join(DATA_DIR, `${room}.json`);
}

function loadPad(room) {
  if (pads[room]) return pads[room];
  try {
    const f = padFile(room);
    if (fs.existsSync(f)) {
      const { text = '', version = 0 } = JSON.parse(fs.readFileSync(f, 'utf8'));
      pads[room] = { text, version };
    } else {
      pads[room] = { text: '', version: 0 };
    }
  } catch {
    pads[room] = { text: '', version: 0 };
  }
  return pads[room];
}

function scheduleSave(room) {
  clearTimeout(saveTimers[room]);
  saveTimers[room] = setTimeout(() => {
    const state = pads[room] || { text: '', version: 0 };
    fs.writeFile(padFile(room), JSON.stringify(state, null, 2), (err) => {
      if (err) console.error(`[${room}] persist error:`, err);
    });
  }, 250);
}

// --- Routes ---
app.get('/', (_req, res) => {
  res.render('index', { title: 'Shared Pad' });
});

// Allows form GET /pad?room=xyz
app.get('/pad', (req, res) => {
  const room = sanitizeRoom(req.query.room);
  if (!room) return res.redirect('/');
  res.redirect(`/pad/${room}`);
});

app.get('/pad/:room', (req, res) => {
  const room = sanitizeRoom(req.params.room);
  if (!room) return res.redirect('/');
  // ensure state exists
  loadPad(room);
  res.render('pad', { title: `Pad: ${room}`, room });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(pads).length });
});

// --- Sockets (room-based) ---
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({ room }) => {
    const r = sanitizeRoom(room);
    if (!r) return;
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = r;
    socket.join(r);

    const state = loadPad(r);
    socket.emit('init', { text: state.text, version: state.version, room: r });

    const count = io.sockets.adapter.rooms.get(r)?.size || 0;
    io.to(r).emit('user-count', count);
  });

  socket.on('text-update', ({ room, text }) => {
    const r = sanitizeRoom(room);
    if (!r || typeof text !== 'string') return;
    const state = loadPad(r);
    state.text = text;
    state.version++;
    scheduleSave(r);
    io.to(r).emit('text-apply', { text: state.text, version: state.version, room: r });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const count = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
    io.to(currentRoom).emit('user-count', count);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Shared pad listening on http://localhost:${PORT}`);
});
