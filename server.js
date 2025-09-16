const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { spawn } = require('child_process');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

/* ----------------------- Shared Pad (rooms) ----------------------- */

const PAD_DIR = path.join(__dirname, 'data', 'pads');
fs.mkdirSync(PAD_DIR, { recursive: true });

const pads = Object.create(null);
const saveTimers = Object.create(null);

function sanitizeRoom(input) {
  if (!input) return '';
  return String(input).toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 64);
}
function padFile(room) { return path.join(PAD_DIR, `${room}.json`); }
function loadPad(room) {
  if (pads[room]) return pads[room];
  try {
    const f = padFile(room);
    if (fs.existsSync(f)) {
      const { text = '', version = 0 } = JSON.parse(fs.readFileSync(f, 'utf8'));
      pads[room] = { text, version };
    } else pads[room] = { text: '', version: 0 };
  } catch { pads[room] = { text: '', version: 0 }; }
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

/* ------------------------- Tools: PDF→JPG ------------------------- */

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'data', 'outputs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname)) return cb(new Error('Only PDF files are allowed'));
    cb(null, true);
  },
});

// Run pdftoppm (Poppler) to produce JPEGs.
// If width is provided, we use -scale-to <width>.
// Else if dpi is provided, we use -r <dpi>.
// Else we let pdftoppm use its default DPI (~150).
function pdfToJpg({ pdfPath, outPrefix, width, quality, dpi }) {
  return new Promise((resolve, reject) => {
    const args = ['-jpeg'];

    if (Number.isInteger(width) && width > 0) {
      args.push('-scale-to', String(width));
    } else if (Number.isInteger(dpi) && dpi > 0) {
      args.push('-r', String(dpi));
    }

    if (Number.isInteger(quality) && quality >= 1 && quality <= 100) {
      args.push('-jpegopt', `quality=${quality}`);
    }

    args.push(pdfPath, outPrefix);

    const proc = spawn('pdftoppm', args);
    let stderr = '';
    proc.stderr.on('data', d => (stderr += d.toString()));
    proc.on('error', err => reject(err)); // catches ENOENT nicely
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`pdftoppm exited ${code}: ${stderr}`));
      resolve();
    });
  });
}

function safeCleanup(paths) {
  for (const p of paths) fs.unlink(p, () => {});
}

/* ------------------------------ Routes ---------------------------- */

// Home = Tools hub
app.get('/', (_req, res) => {
  res.render('index', { title: 'Tools' });
});

// Shared Pad landing (enter key)
app.get('/pad', (req, res) => {
  res.render('pad-index', { title: 'Shared Pad' });
});

// Specific pad
app.get('/pad/:room', (req, res) => {
  const room = sanitizeRoom(req.params.room);
  if (!room) return res.redirect('/pad');
  loadPad(room);
  res.render('pad', { title: `Pad: ${room}`, room });
});

// Tools: PDF→JPG form
app.get('/tools/pdf-to-jpg', (_req, res) => {
  res.render('tool_pdf_to_jpg', { title: 'PDF → JPG' });
});

// Tools: PDF→JPG convert
app.post('/tools/pdf-to-jpg', upload.single('pdf'), async (req, res) => {
  try {
    const quality = Math.min(100, Math.max(1, parseInt(req.body.quality || '85', 10)));
    const width = req.body.width && req.body.width !== 'auto'
      ? Math.min(4096, Math.max(300, parseInt(req.body.width, 10)))
      : null;
    const dpi = req.body.dpi
      ? Math.min(600, Math.max(72, parseInt(req.body.dpi, 10)))
      : null;

    const pdfPath = req.file.path;
    const base = path.basename(req.file.filename);
    const workPrefix = path.join(OUTPUT_DIR, `pdf_${base}`);

    await pdfToJpg({ pdfPath, outPrefix: workPrefix, width, quality, dpi });

    // collect generated files: pdf_<base>-1.jpg, pdf_<base>-2.jpg, ...
    const dir = path.dirname(workPrefix);
    const stem = path.basename(workPrefix);
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(stem + '-') && f.endsWith('.jpg'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) throw new Error('No pages produced');

    if (files.length === 1) {
      const imgPath = path.join(dir, files[0]);
      res.download(imgPath, files[0], () => {
        safeCleanup([pdfPath, imgPath]);
      });
    } else {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="pages.zip"');
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', err => { throw err; });
      archive.pipe(res);
      for (const f of files) archive.file(path.join(dir, f), { name: f });
      archive.finalize();
      res.on('finish', () => safeCleanup([pdfPath, ...files.map(f => path.join(dir, f))]));
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res
        .status(500)
        .send('Converter not available: pdftoppm not found. Install poppler-utils or rebuild the Docker image.');
    }
    console.error(e);
    res.status(400).send('Conversion failed: ' + e.message);
  }
});

// health
app.get('/health', (_req, res) => res.json({ ok: true, pads: Object.keys(pads).length }));

/* --------------------------- Sockets (pads) ------------------------ */

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
  console.log(`Tools + Shared Pad running on http://localhost:${PORT}`);
});
