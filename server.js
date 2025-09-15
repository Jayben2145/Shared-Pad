const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // tweak if you need to restrict origins
  cors: { origin: true, methods: ['GET', 'POST'] }
});

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// in-memory state
let padText = '';
let version = 0;
let clients = 0;

// load persisted text if available
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (fs.existsSync(STATE_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    padText = typeof parsed.text === 'string' ? parsed.text : '';
    version = Number.isInteger(parsed.version) ? parsed.version : 0;
  }
} catch (e) {
  console.error('Failed to load state:', e);
}

// debounced save
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(STATE_FILE, JSON.stringify({ text: padText, version }, null, 2), (err) => {
      if (err) console.error('Persist error:', err);
    });
  }, 250);
}

// routes
app.get('/', (_req, res) => {
  res.render('index', { title: 'Shared Pad' });
});

app.get('/health', (_req, res) => res.json({ ok: true, clients, version }));

// sockets
io.on('connection', (socket) => {
  clients++;
  io.emit('user-count', clients);

  // send current pad on join
  socket.emit('init', { text: padText, version });

  // receive updates from a client
  socket.on('text-update', (msg) => {
    if (!msg || typeof msg.text !== 'string') return;
    // simple last-writer-wins; bump version server-side
    padText = msg.text;
    version++;
    scheduleSave();

    // broadcast to everyone (including sender for version sync)
    io.emit('text-apply', { text: padText, version });
  });

  socket.on('disconnect', () => {
    clients = Math.max(0, clients - 1);
    io.emit('user-count', clients);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Shared pad listening on http://localhost:${PORT}`);
});
